/**
 * Quick RAG smoke test against pgvector (local Xenova + DATABASE_URL).
 * Usage: npx ts-node -r tsconfig-paths/register scripts/smoke-pgvector-search.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { loadMsAssistantConfig } from '../src/features/ms-assistant/config';
import { createMsKnowledgeStore } from '../src/features/ms-assistant/infrastructure/rag/create-knowledge-store';
import { createMsEmbeddings } from '../src/features/ms-assistant/providers';

async function main(): Promise<void> {
  const config = loadMsAssistantConfig();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');

  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const embeddings = createMsEmbeddings(config);
    const store = createMsKnowledgeStore(config, prisma);
    const q = 'What are the three Managed Services qualification tests?';
    const vector = await embeddings.embedOne(q);
    const hits = await store.search(vector, 3);
    console.log(
      JSON.stringify(
        hits.map((h) => ({
          title: h.title,
          source: h.source,
          score: Number(h.score.toFixed(3)),
          preview: h.text.slice(0, 80),
        })),
        null,
        2,
      ),
    );
    if (hits.length === 0) {
      throw new Error('No hits returned from pgvector search');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
