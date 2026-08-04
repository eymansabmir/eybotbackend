/**
 * Ingest Markdown knowledge into pgvector (default) or Qdrant for the Managed Services Assistant.
 *
 * Usage (from eybotbackend):
 *   npm run ingest:ms-kb
 *
 * Prerequisites for pgvector:
 *   - CREATE EXTENSION vector (migration applies this)
 *   - npx prisma migrate deploy
 *   - MS_ASSISTANT_EMBED_PROVIDER=local (384-d Xenova; matches vector(384) column)
 *
 * Default: local Xenova embeddings (no OpenAI). Re-run after changing embed provider/model.
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  loadMsAssistantConfig,
  resolveMsAssistantApiKey,
} from '../src/features/ms-assistant/config';
import { createMsKnowledgeStore } from '../src/features/ms-assistant/infrastructure/rag/create-knowledge-store';
import { chunkMarkdown } from '../src/features/ms-assistant/infrastructure/rag/chunker';
import { createMsEmbeddings } from '../src/features/ms-assistant/providers';

async function main(): Promise<void> {
  const config = loadMsAssistantConfig();

  if (
    config.MS_ASSISTANT_EMBED_PROVIDER === 'openai' &&
    !resolveMsAssistantApiKey(config)
  ) {
    throw new Error(
      'OPENAI_API_KEY or GITHUB_TOKEN is required when MS_ASSISTANT_EMBED_PROVIDER=openai',
    );
  }

  if (
    config.MS_ASSISTANT_VECTOR_STORE === 'pgvector' &&
    config.MS_ASSISTANT_EMBED_PROVIDER !== 'local'
  ) {
    throw new Error(
      'pgvector store is locked to 384-d local Xenova embeddings. ' +
        'Set MS_ASSISTANT_EMBED_PROVIDER=local (or switch MS_ASSISTANT_VECTOR_STORE=qdrant).',
    );
  }

  const knowledgeDir = path.resolve(process.cwd(), config.MS_ASSISTANT_KNOWLEDGE_DIR);
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`Knowledge directory not found: ${knowledgeDir}`);
  }

  const files = walkFiles(knowledgeDir).filter((f) => /\.(md|txt)$/i.test(f));
  if (files.length === 0) {
    throw new Error(`No .md/.txt files under ${knowledgeDir}`);
  }

  console.log(
    `Vector store=${config.MS_ASSISTANT_VECTOR_STORE} | Embedding provider=${config.MS_ASSISTANT_EMBED_PROVIDER}` +
      (config.MS_ASSISTANT_EMBED_PROVIDER === 'local'
        ? ` model=${config.MS_ASSISTANT_LOCAL_EMBED_MODEL}`
        : ` model=${config.MS_ASSISTANT_EMBED_MODEL}`),
  );

  const { prisma, pool } = createPrisma();
  try {
    const embeddings = createMsEmbeddings(config);
    const store = createMsKnowledgeStore(config, prisma);

    // Probe embed dim, then wipe store so removed docs do not linger.
    const probe = await embeddings.embedOne('ey managed services qualification');
    await store.recreate(probe.length);
    console.log(`Recreated knowledge store (dim=${probe.length})`);

    let totalChunks = 0;
    for (const filePath of files) {
      const relative = path.relative(knowledgeDir, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');
      const title = deriveTitle(content, relative);
      const chunks = chunkMarkdown(content, relative, title);
      if (chunks.length === 0) continue;

      const vectors = await embeddings.embed(chunks.map((c) => c.text));
      await store.upsertChunks(chunks, vectors);
      totalChunks += chunks.length;
      console.log(`Upserted ${chunks.length} chunks from ${relative}`);
    }

    console.log(`Done. ${totalChunks} chunks in ${config.MS_ASSISTANT_VECTOR_STORE}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

function createPrisma(): { prisma: PrismaClient; pool: pg.Pool } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for ingest');
  }

  const isLocalConnection = (() => {
    try {
      const host = new URL(connectionString).hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
      return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    }
  })();

  // Azure Postgres can be slow from a laptop; give DDL/DML more room than defaults.
  const pool = new pg.Pool({
    connectionString,
    ssl: isLocalConnection ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 60_000,
    idleTimeoutMillis: 120_000,
  });
  pool.on('connect', (client) => {
    void client.query('SET statement_timeout = 180000');
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function deriveTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
