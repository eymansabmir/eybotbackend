import OpenAI from 'openai';
import type { MsAssistantConfig } from '../../config';
import type { BotResponse } from '../../domain/bot-response';
import type { ConversationMemory } from '../memory/redis-memory';
import type { RetrievedChunk } from '../rag/qdrant.store';
import { createMsOpenAIClient } from './openai-client';
import {
  buildAnswerUserContent,
  MS_ASSISTANT_SYSTEM_PROMPT,
  parseBotResponse,
  type MsAssistantChat,
} from './shared';

export class MsAssistantLlm implements MsAssistantChat {
  private readonly client: OpenAI;

  constructor(private readonly config: MsAssistantConfig) {
    this.client = createMsOpenAIClient(config);
  }

  async answer(params: {
    question: string;
    chunks: RetrievedChunk[];
    memory: ConversationMemory;
  }): Promise<BotResponse> {
    const userContent = buildAnswerUserContent(params);

    const completion = await this.createChatCompletion({
      model: this.config.MS_ASSISTANT_CHAT_MODEL,
      temperature: 0.2,
      preferJsonObject: true,
      messages: [
        { role: 'system', content: MS_ASSISTANT_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    return parseBotResponse(raw);
  }

  async summarizeIfNeeded(memory: ConversationMemory): Promise<string | undefined> {
    if (memory.turns.length < 5) return memory.summary;
    const transcript = memory.turns
      .map((t) => `${t.role}: ${t.content}`)
      .join('\n')
      .slice(0, 4000);

    const completion = await this.createChatCompletion({
      model: this.config.MS_ASSISTANT_CHAT_MODEL,
      temperature: 0,
      preferJsonObject: false,
      messages: [
        {
          role: 'system',
          content:
            'Summarize this EY Managed Services WhatsApp chat in 2-3 short bullets. No fluff.',
        },
        { role: 'user', content: transcript },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() || memory.summary;
  }

  private async createChatCompletion(params: {
    model: string;
    temperature: number;
    preferJsonObject: boolean;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  }): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const useJson =
      params.preferJsonObject && this.config.MS_ASSISTANT_JSON_OBJECT === 'true';

    try {
      return await this.client.chat.completions.create({
        model: params.model,
        temperature: params.temperature,
        ...(useJson ? { response_format: { type: 'json_object' as const } } : {}),
        messages: params.messages,
      });
    } catch (err) {
      if (!useJson) throw err;
      return await this.client.chat.completions.create({
        model: params.model,
        temperature: params.temperature,
        messages: params.messages,
      });
    }
  }
}
