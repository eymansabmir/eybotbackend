import type { PrismaClient } from '@prisma/client';
import type { KnowledgeChunk } from './chunker';
import type { KnowledgeStore, RetrievedChunk } from './knowledge-store';

/** Local Xenova all-MiniLM-L6-v2 dimension — must match migration vector(384). */
export const PGVECTOR_EMBED_DIMS = 384;

export class PgVectorKnowledgeStore implements KnowledgeStore {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureReady(vectorSize: number): Promise<void> {
    assertLocalDims(vectorSize);

    // Prefer a cheap table check first. CREATE EXTENSION on Azure Postgres is often
    // slow/blocked (allowlist + privileges) and was timing out ingest.
    const rows = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ms_knowledge_chunks'
       ) AS "exists"`,
    );
    if (rows[0]?.exists) return;

    try {
      await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (err) {
      throw new Error(
        '[MsAssistant] ms_knowledge_chunks missing and CREATE EXTENSION vector failed. ' +
          'Enable the vector extension on the server, then run prisma migrate deploy. ' +
          `Cause: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const again = await this.prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ms_knowledge_chunks'
       ) AS "exists"`,
    );
    if (!again[0]?.exists) {
      throw new Error(
        '[MsAssistant] ms_knowledge_chunks missing — run prisma migrate deploy',
      );
    }
  }

  async recreate(vectorSize: number): Promise<void> {
    await this.ensureReady(vectorSize);
    await this.prisma.$executeRawUnsafe('TRUNCATE TABLE ms_knowledge_chunks');
  }

  async deleteBySource(source: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'DELETE FROM ms_knowledge_chunks WHERE source = $1',
      source,
    );
  }

  async upsertChunks(chunks: KnowledgeChunk[], vectors: number[][]): Promise<void> {
    if (chunks.length === 0) return;
    if (chunks.length !== vectors.length) {
      throw new Error('[MsAssistant] chunk/vector length mismatch');
    }

    const dim = vectors[0]!.length;
    assertLocalDims(dim);
    await this.ensureReady(dim);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const vector = vectors[i]!;
      if (vector.length !== dim) {
        throw new Error('[MsAssistant] inconsistent embedding dimensions in batch');
      }
      const embeddingLiteral = toVectorLiteral(vector);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO ms_knowledge_chunks (id, source, title, text, embedding, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::vector, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           source = EXCLUDED.source,
           title = EXCLUDED.title,
           text = EXCLUDED.text,
           embedding = EXCLUDED.embedding,
           updated_at = NOW()`,
        chunk.id,
        chunk.source,
        chunk.title,
        chunk.text,
        embeddingLiteral,
      );
    }
  }

  async search(vector: number[], topK: number): Promise<RetrievedChunk[]> {
    if (vector.length === 0 || topK < 1) return [];
    assertLocalDims(vector.length);

    const embeddingLiteral = toVectorLiteral(vector);
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ text: string; source: string; title: string; score: number }>
    >(
      `SELECT
         text,
         source,
         title,
         (1 - (embedding <=> $1::vector))::float8 AS score
       FROM ms_knowledge_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      embeddingLiteral,
      topK,
    );

    return rows.map((row) => ({
      text: row.text ?? '',
      source: row.source ?? '',
      title: row.title ?? '',
      score: Number(row.score) || 0,
    }));
  }
}

function assertLocalDims(vectorSize: number): void {
  if (vectorSize !== PGVECTOR_EMBED_DIMS) {
    throw new Error(
      `[MsAssistant] pgvector store expects ${PGVECTOR_EMBED_DIMS}-d embeddings ` +
        `(local Xenova). Got ${vectorSize}. Recreate the table if switching models.`,
    );
  }
}

/** pgvector text input form: [0.1,0.2,...] */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((n) => Number(n).toString()).join(',')}]`;
}
