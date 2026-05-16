-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "creatorId" TEXT;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
