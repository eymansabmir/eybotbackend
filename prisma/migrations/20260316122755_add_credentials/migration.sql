-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('OPENAI', 'GOOGLE_SHEETS', 'NOCODB', 'ELEVENLABS', 'ZAPIER', 'HTTP_REQUEST', 'ANTHROPIC', 'MAKE', 'DEEPSEEK');


-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credentials_orgId_type_isActive_idx" ON "credentials"("orgId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_orgId_type_name_key" ON "credentials"("orgId", "type", "name");

