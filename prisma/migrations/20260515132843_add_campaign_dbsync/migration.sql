-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "dataSourceId" TEXT,
ADD COLUMN     "tableName" TEXT;

-- AlterTable
ALTER TABLE "CampaignVersion" ALTER COLUMN "filePath" DROP NOT NULL;
