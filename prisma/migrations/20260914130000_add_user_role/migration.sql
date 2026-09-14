-- AlterTable: add role column expected by Better Auth (additionalFields.role)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'CLIENTMEMBER';
