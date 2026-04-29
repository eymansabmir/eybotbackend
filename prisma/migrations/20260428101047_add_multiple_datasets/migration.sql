-- AlterTable
ALTER TABLE "routing_configs" ADD COLUMN     "entityTypeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
