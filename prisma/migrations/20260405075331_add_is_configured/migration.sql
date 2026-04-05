-- AlterEnum
ALTER TYPE "CredentialType" ADD VALUE 'WHATSAPP_CLOUD';

-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "isConfigured" BOOLEAN NOT NULL DEFAULT false;
