-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "fieldMapping" JSONB;

-- AlterTable
ALTER TABLE "Flow" ADD COLUMN     "variables" JSONB;
