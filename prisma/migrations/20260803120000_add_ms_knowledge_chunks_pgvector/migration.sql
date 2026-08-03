-- Managed Services Assistant RAG store (pgvector, 384-d local Xenova embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "ms_knowledge_chunks" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ms_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ms_knowledge_chunks_source_idx" ON "ms_knowledge_chunks"("source");

CREATE INDEX "ms_knowledge_chunks_embedding_idx"
  ON "ms_knowledge_chunks"
  USING hnsw ("embedding" vector_cosine_ops);
