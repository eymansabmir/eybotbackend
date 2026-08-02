import { z } from 'zod';
import { BotResponseSchema, type BotResponse } from '../../domain/bot-response';
import type { ConversationMemory } from '../memory/redis-memory';
import type { RetrievedChunk } from '../rag/qdrant.store';

export const MS_ASSISTANT_SYSTEM_PROMPT = `You are the EY Managed Services Qualification Assistant for EY partners (WhatsApp, menu-driven).

Your knowledge base is the MS qualification playbook: customer discussion triggers, EY conversion moves, value to position, discovery questions, conversation technique, and when NOT to force an MS construct.

Answer only using retrieved knowledge.
If the answer is unavailable, clearly state that the knowledge base does not contain enough information.
Never invent offerings, savings claims, or client-specific facts.

When the user pastes a customer statement, structure the reply as:
• What it may indicate
• EY MS conversation move
• Value to position
• Discovery question

Be concise (WhatsApp): short bullets, professional consulting tone.
Do not invent menus or WhatsApp payloads — navigation is handled by the app.

You MUST respond with a single JSON object:
{ "mode": "text", "text": string }`;

export interface MsAssistantChat {
  answer(params: {
    question: string;
    chunks: RetrievedChunk[];
    memory: ConversationMemory;
  }): Promise<BotResponse>;
  summarizeIfNeeded(memory: ConversationMemory): Promise<string | undefined>;
}

export function buildAnswerUserContent(params: {
  question: string;
  chunks: RetrievedChunk[];
  memory: ConversationMemory;
}): string | null {
  if (params.chunks.length === 0) return null;

  const contextBlock = params.chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.title} — ${c.source}, score=${c.score.toFixed(3)})\n${c.text}`,
    )
    .join('\n\n');

  const history = params.memory.turns
    .slice(-6)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');

  return (
    `${params.memory.summary ? `Conversation summary:\n${params.memory.summary}\n\n` : ''}` +
    `${history ? `Recent turns:\n${history}\n\n` : ''}` +
    `Retrieved knowledge:\n${contextBlock}\n\n` +
    `User question:\n${params.question}\n\n` +
    `Respond as JSON only.`
  );
}

export function insufficientKnowledgeResponse(): BotResponse {
  return {
    mode: 'text',
    text:
      'The knowledge base does not contain enough information to answer that confidently. ' +
      'Please rephrase or ask about EY Managed Services offerings such as cloud, cybersecurity, or SAP.',
  };
}

export function parseBotResponse(raw: string): BotResponse {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = BotResponseSchema.safeParse(json);
    if (parsed.success) return parsed.data;

    const loose = z.object({ text: z.string().min(1) }).safeParse(json);
    if (loose.success) {
      return { mode: 'text', text: loose.data.text };
    }
  } catch {
    // ignore — fall through to plain text
  }

  // Strip markdown fences if the model wrapped JSON
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return parseBotResponse(fenced[1].trim());
  }

  const trimmed = raw.trim();
  if (trimmed) {
    return { mode: 'text', text: trimmed.slice(0, 3500) };
  }

  return {
    mode: 'text',
    text: 'I could not generate a structured answer just now. Please try your question again.',
  };
}
