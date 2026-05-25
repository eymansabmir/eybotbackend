-- Active: 1778923567817@@ep-raspy-sun-antap3ac-pooler.c-6.us-east-1.aws.neon.tech@5432@neondb
-- AlterTable
ALTER TABLE "chat_session" ADD COLUMN     "lastRenudgeAt" TIMESTAMPTZ(3),
ADD COLUMN     "renudgeAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "renudge_configs" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT NOT NULL DEFAULT 'Are you still there? Would you like to continue?',
    "buttons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "renudge_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renudge_logs" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renudge_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "renudge_configs_flowId_key" ON "renudge_configs"("flowId");

-- CreateIndex
CREATE INDEX "renudge_logs_flowId_waId_idx" ON "renudge_logs"("flowId", "waId");

-- CreateIndex
CREATE INDEX "renudge_logs_sessionId_idx" ON "renudge_logs"("sessionId");

-- AddForeignKey
ALTER TABLE "renudge_configs" ADD CONSTRAINT "renudge_configs_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renudge_logs" ADD CONSTRAINT "renudge_logs_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
