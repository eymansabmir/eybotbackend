import { z } from 'zod';
import { BotResponseSchema, type BotResponse } from '../../domain/bot-response';
import type { ConversationMemory } from '../memory/redis-memory';
import type { RetrievedChunk } from '../rag/knowledge-store';
import { formatWhatsAppText } from '../formatter/whatsapp-format';

export const MS_ASSISTANT_SYSTEM_PROMPT = `You are the EY Managed Services Qualification Assistant for EY partners on WhatsApp.

Users may type free-text questions anytime (not only from a menu). Answer those directly.

Your primary knowledge base covers MS qualification, customer discussion triggers, EY conversion moves, offerings (technology, cyber, HRMS, learning, Jumpstart AMS), delivery model, and human handoff contacts when present in retrieved knowledge.

## Knowledge vs generic guidance
- Prefer retrieved knowledge when provided.
- If retrieved knowledge is empty or weak, still answer helpfully with *generic professional Managed Services / qualification guidance* drawn from your own expertise (do NOT say the knowledge base failed, do NOT apologise for missing documents, do NOT say "I don't have enough information in the knowledge base").
- Never invent client-specific facts, savings percentages, named contacts, or contract terms that are not in retrieved knowledge.
- Never invent fake playbook quotes; when generalising, keep tone advisory.

## When the user pastes a customer statement
Structure the reply as short WhatsApp bullets:
* *Indicates:* …
* *EY move:* …
* *Value:* …
* *Ask:* …

## WhatsApp formatting (mandatory)
Use ONLY WhatsApp markup — not Markdown/HTML:
- *bold* with single asterisks (NOT **double**)
- _italic_ with underscores
- ~strikethrough~ with tildes
- \`inline code\` with single backticks; monospace blocks with triple backticks
- Bullets: "* " or "- " at line start
- Numbered: "1. " "2. "
- Quote: "> " at line start
Do not use # headings, HTML, or markdown links [text](url). Put URLs in plain text if needed.

## Emoji (professional, sparse)
Use 0–2 professional emojis when they improve scanning (e.g. ✅ tip, ⚠️ caution, 💡 insight, 🔎 lens). Never spam emojis. Never use slang or playful stickers.

## Style
Concise executive tone. Prefer 4–8 short lines. Navigation buttons are handled by the app — do not invent menus.

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
}): string {
  const history = params.memory.turns
    .slice(-6)
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');

  const contextBlock =
    params.chunks.length > 0
      ? params.chunks
          .map(
            (c, i) =>
              `[${i + 1}] (${c.title} — ${c.source}, score=${c.score.toFixed(3)})\n${c.text}`,
          )
          .join('\n\n')
      : '(none — answer with generic professional MS qualification guidance; do not mention missing KB)';

  return (
    `${params.memory.summary ? `Conversation summary:\n${params.memory.summary}\n\n` : ''}` +
    `${history ? `Recent turns:\n${history}\n\n` : ''}` +
    `Retrieved knowledge:\n${contextBlock}\n\n` +
    `User question:\n${params.question}\n\n` +
    `Respond as JSON only. Format the "text" field for WhatsApp (*bold*, bullets, sparse emoji).`
  );
}

export function parseBotResponse(raw: string): BotResponse {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = BotResponseSchema.safeParse(json);
    if (parsed.success) {
      const data = parsed.data;
      if ('text' in data && typeof data.text === 'string') {
        return { ...data, text: formatWhatsAppText(data.text) };
      }
      return data;
    }

    const loose = z.object({ text: z.string().min(1) }).safeParse(json);
    if (loose.success) {
      return { mode: 'text', text: formatWhatsAppText(loose.data.text) };
    }
  } catch {
    // ignore — fall through to plain text
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return parseBotResponse(fenced[1].trim());
  }

  const trimmed = raw.trim();
  if (trimmed) {
    return { mode: 'text', text: formatWhatsAppText(trimmed.slice(0, 3500)) };
  }

  return {
    mode: 'text',
    text: formatWhatsAppText(
      '💡 Please rephrase your question, or pick a theme from the menu for a guided answer.',
    ),
  };
}
