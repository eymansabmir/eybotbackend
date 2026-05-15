-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('IDLE', 'RUNNING', 'FAILED', 'SUCCESS');

-- CreateEnum
CREATE TYPE "DbProvider" AS ENUM ('POSTGRES', 'MYSQL', 'SQL_SERVER', 'ORACLE');

-- AlterEnum
ALTER TYPE "CredentialType" ADD VALUE 'DATABASE_CONNECTOR';

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DbProvider" NOT NULL,
    "credentialId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "botId" TEXT,
    "name" TEXT NOT NULL,
    "sqlQuery" TEXT NOT NULL,
    "cursorField" TEXT,
    "lastCursor" TEXT,
    "cronSchedule" TEXT DEFAULT '0 * * * *',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "SyncStatus" NOT NULL DEFAULT 'IDLE',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "totalRecordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_sources_orgId_idx" ON "data_sources"("orgId");

-- CreateIndex
CREATE INDEX "sync_jobs_dataSourceId_isActive_idx" ON "sync_jobs"("dataSourceId", "isActive");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
