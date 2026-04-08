-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecipientStatus" ADD VALUE 'delivered';
ALTER TYPE "RecipientStatus" ADD VALUE 'read';
ALTER TYPE "RecipientStatus" ADD VALUE 'replied';

-- AlterTable
ALTER TABLE "CampaignRecipient" DROP COLUMN "attempts",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3),
ADD COLUMN     "repliedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CampaignStats" ADD COLUMN     "delivered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "read" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replied" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_messageId_key" ON "CampaignRecipient"("messageId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_messageId_idx" ON "CampaignRecipient"("messageId");
