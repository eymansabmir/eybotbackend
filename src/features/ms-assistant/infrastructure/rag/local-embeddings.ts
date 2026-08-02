import type { MsAssistantConfig } from '../../config';
import type { MsEmbeddings } from './embeddings.types';

type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

/**
 * On-device embeddings via @xenova/transformers (no OpenAI / GitHub Models).
 * Default model: Xenova/all-MiniLM-L6-v2 (384-dim).
 */
export class LocalEmbeddings implements MsEmbeddings {
  private extractor: FeatureExtractor | null = null;
  private readonly ready: Promise<void>;

  constructor(private readonly config: MsAssistantConfig) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    this.extractor = (await pipeline(
      'feature-extraction',
      this.config.MS_ASSISTANT_LOCAL_EMBED_MODEL,
    )) as FeatureExtractor;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ready;
    if (!this.extractor) {
      throw new Error('[MsAssistant] local embedding model failed to load');
    }

    const vectors: number[][] = [];
    for (const text of texts) {
      const output = await this.extractor(text, { pooling: 'mean', normalize: true });
      vectors.push(Array.from(output.data));
    }
    return vectors;
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.embed([text]);
    if (!vector) throw new Error('[MsAssistant] empty local embedding response');
    return vector;
  }
}
