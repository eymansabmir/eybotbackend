import type { MsAssistantConfig } from '../../config';
import type { MsEmbeddings } from './embeddings.types';
import { logger } from '../../../../utils/logger';

type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

/**
 * On-device embeddings via @xenova/transformers (no OpenAI / GitHub Models).
 * Default model: Xenova/all-MiniLM-L6-v2 (384-dim).
 *
 * Note: onnxruntime-node needs glibc (Debian/Ubuntu images). Alpine/musl often
 * crashes with Ort::Exception — use node:*-bookworm-slim for Docker.
 */
export class LocalEmbeddings implements MsEmbeddings {
  private extractor: FeatureExtractor | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly config: MsAssistantConfig) {}

  private async ensureReady(): Promise<void> {
    if (this.extractor) return;
    if (!this.initPromise) {
      this.initPromise = this.init().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    await this.initPromise;
  }

  private async init(): Promise<void> {
    logger.info(
      { model: this.config.MS_ASSISTANT_LOCAL_EMBED_MODEL },
      'MsAssistant: loading local embedding model (Xenova)',
    );

    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    // Node + onnxruntime-web: multi-thread WASM is unsupported / unstable
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.numThreads = 1;
    }

    this.extractor = (await pipeline(
      'feature-extraction',
      this.config.MS_ASSISTANT_LOCAL_EMBED_MODEL,
    )) as FeatureExtractor;

    logger.info('MsAssistant: local embedding model ready');
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureReady();
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
