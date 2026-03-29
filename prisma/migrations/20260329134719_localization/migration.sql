-- CreateTable
CREATE TABLE "flow_translations" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "translatedData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flow_translations_flowId_idx" ON "flow_translations"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_translations_flowId_language_key" ON "flow_translations"("flowId", "language");

-- AddForeignKey
ALTER TABLE "flow_translations" ADD CONSTRAINT "flow_translations_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
