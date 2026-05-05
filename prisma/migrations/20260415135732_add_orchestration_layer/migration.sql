-- CreateTable
CREATE TABLE "EntityType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "EntityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAttribute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "operators" JSONB NOT NULL,
    "values" JSONB,

    CONSTRAINT "EntityAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_providers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" TEXT NOT NULL,
    "routingConfigId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityType_tenantId_name_key" ON "EntityType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Entity_tenantId_entityTypeId_idx" ON "Entity"("tenantId", "entityTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAttribute_tenantId_entityTypeId_key_key" ON "EntityAttribute"("tenantId", "entityTypeId", "key");

-- CreateIndex
CREATE INDEX "voice_providers_tenantId_idx" ON "voice_providers"("tenantId");

-- CreateIndex
CREATE INDEX "routing_configs_tenantId_idx" ON "routing_configs"("tenantId");

-- CreateIndex
CREATE INDEX "routing_rules_routingConfigId_idx" ON "routing_rules"("routingConfigId");

-- AddForeignKey
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_routingConfigId_fkey" FOREIGN KEY ("routingConfigId") REFERENCES "routing_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
