import { approveAll, CopilotClient } from '@github/copilot-sdk';
import type { MsAssistantConfig } from '../../config';
import { resolveMsAssistantApiKey } from '../../config';
import type { ConversationMemory } from '../memory/redis-memory';
import type { RetrievedChunk } from '../rag/qdrant.store';
import type { BotResponse } from '../../domain/bot-response';
import {
  buildAnswerUserContent,
  insufficientKnowledgeResponse,
  MS_ASSISTANT_SYSTEM_PROMPT,
  parseBotResponse,
  type MsAssistantChat,
} from './shared';

/**
 * Chat via official GitHub Copilot SDK (PAT + Copilot subscription).
 * Does not call api.openai.com or models.github.ai.
 */
export class CopilotMsAssistantLlm implements MsAssistantChat {
  private readonly client: CopilotClient;
  private readonly started: Promise<void>;

  constructor(private readonly config: MsAssistantConfig) {
    const token = resolveMsAssistantApiKey(config);
    if (!token) {
      throw new Error(
        '[MsAssistant] GITHUB_TOKEN or OPENAI_API_KEY (GitHub PAT) is required for Copilot chat',
      );
    }

    this.client = new CopilotClient({
      gitHubToken: token,
      useLoggedInUser: false,
    });
    this.started = this.client.start();
  }

  async answer(params: {
    question: string;
    chunks: RetrievedChunk[];
    memory: ConversationMemory;
  }): Promise<BotResponse> {
    const userContent = buildAnswerUserContent(params);
    if (!userContent) return insufficientKnowledgeResponse();

    await this.started;
    const session = await this.client.createSession({
      model: this.config.MS_ASSISTANT_CHAT_MODEL,
      systemMessage: { mode: 'replace', content: MS_ASSISTANT_SYSTEM_PROMPT },
      availableTools: [],
      onPermissionRequest: approveAll,
    });

    try {
      const event = await session.sendAndWait({ prompt: userContent }, 120_000);
      const raw = event?.data?.content ?? '{}';
      return parseBotResponse(raw);
    } finally {
      try {
        await this.client.deleteSession(session.sessionId);
      } catch {
        // best-effort cleanup
      }
    }
  }

  async summarizeIfNeeded(memory: ConversationMemory): Promise<string | undefined> {
    if (memory.turns.length < 5) return memory.summary;

    const transcript = memory.turns
      .map((t) => `${t.role}: ${t.content}`)
      .join('\n')
      .slice(0, 4000);

    await this.started;
    const session = await this.client.createSession({
      model: this.config.MS_ASSISTANT_CHAT_MODEL,
      systemMessage: {
        mode: 'replace',
        content:
          'Summarize this EY Managed Services WhatsApp chat in 2-3 short bullets. No fluff.',
      },
      availableTools: [],
      onPermissionRequest: approveAll,
    });

    try {
      const event = await session.sendAndWait({ prompt: transcript }, 60_000);
      return event?.data?.content?.trim() || memory.summary;
    } finally {
      try {
        await this.client.deleteSession(session.sessionId);
      } catch {
        // best-effort
      }
    }
  }
}
