-- Split chatbot runtime sessions from Better Auth sessions.
-- Keep existing "session" rows for auth and introduce dedicated "chat_session" table.

CREATE TABLE "chat_session" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "flowVersion" INTEGER NOT NULL DEFAULT 1,
    "contactId" TEXT,
    "waId" TEXT NOT NULL,
    "waBusinessNumber" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "currentNodeId" TEXT NOT NULL,
    "variables" JSONB,
    "history" JSONB,
    "waitingFor" JSONB,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "chat_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_session_waId_status_idx" ON "chat_session"("waId", "status");
CREATE INDEX "chat_session_flowId_status_idx" ON "chat_session"("flowId", "status");
CREATE INDEX "chat_session_waBusinessNumber_waId_isCurrent_idx" ON "chat_session"("waBusinessNumber", "waId", "isCurrent");

ALTER TABLE "session"
    DROP COLUMN IF EXISTS "flowId",
    DROP COLUMN IF EXISTS "flowVersion",
    DROP COLUMN IF EXISTS "contactId",
    DROP COLUMN IF EXISTS "waId",
    DROP COLUMN IF EXISTS "waBusinessNumber",
    DROP COLUMN IF EXISTS "status",
    DROP COLUMN IF EXISTS "currentNodeId",
    DROP COLUMN IF EXISTS "variables",
    DROP COLUMN IF EXISTS "history",
    DROP COLUMN IF EXISTS "waitingFor",
    DROP COLUMN IF EXISTS "isCurrent";
