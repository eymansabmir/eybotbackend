/*
  Warnings:

  - You are about to drop the `Entity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EntityAttribute` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EntityType` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `voice_providers` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RoutingType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('ACTIVE', 'DRAFT', 'PAUSED');

-- AlterTable
ALTER TABLE "routing_configs" ADD COLUMN     "description" TEXT,
ADD COLUMN     "entityTypeId" TEXT,
ADD COLUMN     "status" "ConfigStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "type" "RoutingType" NOT NULL DEFAULT 'AUTOMATIC';

-- AlterTable
ALTER TABLE "routing_rules" ADD COLUMN     "voiceProviderId" TEXT;

-- AlterTable
ALTER TABLE "voice_providers" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropTable
DROP TABLE "Entity";

-- DropTable
DROP TABLE "EntityAttribute";

-- DropTable
DROP TABLE "EntityType";

-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'AUTOMATIC',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_attributes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "operators" JSONB NOT NULL,
    "values" JSONB,

    CONSTRAINT "dataset_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_orchestration_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "entityId" TEXT,
    "entityTypeId" TEXT,
    "routingConfigId" TEXT,
    "voiceProviderId" TEXT,
    "matchedRuleId" TEXT,
    "flow" TEXT NOT NULL DEFAULT 'voice_orchestration',
    "step" TEXT NOT NULL,
    "status" INTEGER,
    "accepted" BOOLEAN,
    "message" TEXT,
    "durationMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_orchestration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasets_tenantId_name_key" ON "datasets"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_attributes_tenantId_entityTypeId_key_key" ON "dataset_attributes"("tenantId", "entityTypeId", "key");

-- CreateIndex
CREATE INDEX "voice_orchestration_events_tenantId_traceId_idx" ON "voice_orchestration_events"("tenantId", "traceId");

-- CreateIndex
CREATE INDEX "voice_orchestration_events_createdAt_idx" ON "voice_orchestration_events"("createdAt");

-- AddForeignKey
ALTER TABLE "dataset_attributes" ADD CONSTRAINT "dataset_attributes_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_configs" ADD CONSTRAINT "routing_configs_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_voiceProviderId_fkey" FOREIGN KEY ("voiceProviderId") REFERENCES "voice_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_orchestration_events" ADD CONSTRAINT "voice_orchestration_events_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "datasets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_orchestration_events" ADD CONSTRAINT "voice_orchestration_events_routingConfigId_fkey" FOREIGN KEY ("routingConfigId") REFERENCES "routing_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_orchestration_events" ADD CONSTRAINT "voice_orchestration_events_voiceProviderId_fkey" FOREIGN KEY ("voiceProviderId") REFERENCES "voice_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_orchestration_events" ADD CONSTRAINT "voice_orchestration_events_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "routing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
