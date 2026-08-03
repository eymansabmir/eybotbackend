import type { PrismaClient } from '@prisma/client';
import type { MsAssistantConfig } from '../../config';
import type { KnowledgeStore } from './knowledge-store';
import { PgVectorKnowledgeStore } from './pgvector.store';
import { QdrantKnowledgeStore } from './qdrant.store';

export function createMsKnowledgeStore(
  config: MsAssistantConfig,
  prisma: PrismaClient,
): KnowledgeStore {
  if (config.MS_ASSISTANT_VECTOR_STORE === 'qdrant') {
    return new QdrantKnowledgeStore(config);
  }
  return new PgVectorKnowledgeStore(prisma);
}
