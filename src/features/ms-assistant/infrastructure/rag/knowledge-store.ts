import type { KnowledgeChunk } from './chunker';

export interface RetrievedChunk {
  text: string;
  source: string;
  title: string;
  score: number;
}

/** Vector knowledge store used by ingest + MsAssistantService. */
export interface KnowledgeStore {
  ensureReady(vectorSize: number): Promise<void>;
  /** Wipe all chunks and prepare for a full re-ingest. */
  recreate(vectorSize: number): Promise<void>;
  upsertChunks(chunks: KnowledgeChunk[], vectors: number[][]): Promise<void>;
  search(vector: number[], topK: number): Promise<RetrievedChunk[]>;
  deleteBySource?(source: string): Promise<void>;
}
