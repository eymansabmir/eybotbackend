-- CreateEnum
CREATE TYPE "FlowStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'waiting', 'completed', 'timed_out', 'error');

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "FlowStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowVersion" INTEGER NOT NULL,
    "contactId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "waBusinessNumber" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "currentNodeId" TEXT NOT NULL,
    "variables" JSONB,
    "history" JSONB,
    "waitingFor" JSONB,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tags" TEXT[],
    "customFields" JSONB,
    "optIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flow_orgId_status_idx" ON "Flow"("orgId", "status");

-- CreateIndex
CREATE INDEX "Session_waId_status_idx" ON "Session"("waId", "status");

-- CreateIndex
CREATE INDEX "Session_flowId_status_idx" ON "Session"("flowId", "status");

-- CreateIndex
CREATE INDEX "Session_waBusinessNumber_waId_isCurrent_idx" ON "Session"("waBusinessNumber", "waId", "isCurrent");

-- CreateIndex
CREATE INDEX "Contact_orgId_idx" ON "Contact"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_orgId_waId_key" ON "Contact"("orgId", "waId");
