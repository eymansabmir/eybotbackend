/**
 * Ingest Markdown knowledge into Qdrant for the Managed Services Assistant.
 *
 * Usage (from eybotbackend):
 *   npm run ingest:ms-kb
 *
 * Default: local Xenova embeddings (no OpenAI). Re-run after changing embed provider/model.
 */
import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import {
  loadMsAssistantConfig,
  resolveMsAssistantApiKey,
} from '../src/features/ms-assistant/config';
import { chunkMarkdown } from '../src/features/ms-assistant/infrastructure/rag/chunker';
import { QdrantKnowledgeStore } from '../src/features/ms-assistant/infrastructure/rag/qdrant.store';
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

  const knowledgeDir = path.resolve(process.cwd(), config.MS_ASSISTANT_KNOWLEDGE_DIR);
  if (!fs.existsSync(knowledgeDir)) {
    throw new Error(`Knowledge directory not found: ${knowledgeDir}`);
  }

  const files = walkFiles(knowledgeDir).filter((f) => /\.(md|txt)$/i.test(f));
  if (files.length === 0) {
    throw new Error(`No .md/.txt files under ${knowledgeDir}`);
  }

  console.log(
    `Embedding provider=${config.MS_ASSISTANT_EMBED_PROVIDER}` +
      (config.MS_ASSISTANT_EMBED_PROVIDER === 'local'
        ? ` model=${config.MS_ASSISTANT_LOCAL_EMBED_MODEL}`
        : ` model=${config.MS_ASSISTANT_EMBED_MODEL}`),
  );

  const embeddings = createMsEmbeddings(config);
  const store = new QdrantKnowledgeStore(config);

  // Probe embed dim, then wipe collection so removed demo docs do not linger.
  const probe = await embeddings.embedOne('ey managed services qualification');
  await store.recreateCollection(probe.length);
  console.log(`Recreated collection "${config.QDRANT_COLLECTION}" (dim=${probe.length})`);

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

  console.log(
    `Done. ${totalChunks} chunks in collection "${config.QDRANT_COLLECTION}" @ ${config.QDRANT_URL}`,
  );
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
