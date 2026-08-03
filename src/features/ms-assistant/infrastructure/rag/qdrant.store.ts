import crypto from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { MsAssistantConfig } from '../../config';
import type { KnowledgeChunk } from './chunker';
import type { KnowledgeStore, RetrievedChunk } from './knowledge-store';

export type { RetrievedChunk } from './knowledge-store';

export class QdrantKnowledgeStore implements KnowledgeStore {
  private readonly client: QdrantClient;
  private readonly collection: string;

  constructor(config: MsAssistantConfig) {
    const url = config.QDRANT_URL ?? 'http://localhost:6333';
    this.client = new QdrantClient({
      url,
      checkCompatibility: false,
    });
    this.collection = config.QDRANT_COLLECTION;
  }

  async ensureReady(vectorSize: number): Promise<void> {
    const exists = await this.client.collectionExists(this.collection);
    if (exists.exists) return;

    await this.client.createCollection(this.collection, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });
  }

  /** Drop and recreate collection (use on full KB re-ingest to remove stale chunks). */
  async recreate(vectorSize: number): Promise<void> {
    const exists = await this.client.collectionExists(this.collection);
    if (exists.exists) {
      await this.client.deleteCollection(this.collection);
    }
    await this.client.createCollection(this.collection, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });
  }

  async upsertChunks(chunks: KnowledgeChunk[], vectors: number[][]): Promise<void> {
    if (chunks.length === 0) return;
    if (chunks.length !== vectors.length) {
      throw new Error('[MsAssistant] chunk/vector length mismatch');
    }

    await this.ensureReady(vectors[0]!.length);

    await this.client.upsert(this.collection, {
      wait: true,
      points: chunks.map((chunk, i) => ({
        id: hashToUuid(chunk.id),
        vector: vectors[i]!,
        payload: {
          text: chunk.text,
          source: chunk.source,
          title: chunk.title,
          chunkKey: chunk.id,
        },
      })),
    });
  }

  async search(vector: number[], topK: number): Promise<RetrievedChunk[]> {
    const exists = await this.client.collectionExists(this.collection);
    if (!exists.exists) return [];

    const results = await this.client.search(this.collection, {
      vector,
      limit: topK,
      with_payload: true,
    });

    return results.map((hit) => {
      const payload = (hit.payload ?? {}) as Record<string, unknown>;
      return {
        text: String(payload['text'] ?? ''),
        source: String(payload['source'] ?? ''),
        title: String(payload['title'] ?? ''),
        score: hit.score ?? 0,
      };
    });
  }
}

/** Deterministic UUID from string for Qdrant point ids. */
function hashToUuid(input: string): string {
  const hex = crypto.createHash('sha256').update(input).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
