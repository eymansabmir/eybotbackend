import OpenAI from 'openai';
import type { MsAssistantConfig } from '../../config';
import { createMsOpenAIClient } from '../llm/openai-client';
import type { MsEmbeddings } from './embeddings.types';

export class OpenAIEmbeddings implements MsEmbeddings {
  private readonly client: OpenAI;

  constructor(private readonly config: MsAssistantConfig) {
    this.client = createMsOpenAIClient(config);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await this.client.embeddings.create({
      model: this.config.MS_ASSISTANT_EMBED_MODEL,
      input: texts,
    });
    return response.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((row) => row.embedding);
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    if (!vector) throw new Error('[MsAssistant] empty embedding response');
    return vector;
  }
}
