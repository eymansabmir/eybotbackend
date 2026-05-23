-- CreateTable
CREATE TABLE "flow_revisions" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flow_revisions_flowId_idx" ON "flow_revisions"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "flow_revisions_flowId_version_key" ON "flow_revisions"("flowId", "version");

-- AddForeignKey
ALTER TABLE "flow_revisions" ADD CONSTRAINT "flow_revisions_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
