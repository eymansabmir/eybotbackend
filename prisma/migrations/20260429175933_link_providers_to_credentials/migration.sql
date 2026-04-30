-- AlterTable
ALTER TABLE "voice_providers" ADD COLUMN     "credentialId" TEXT;

-- AddForeignKey
ALTER TABLE "voice_providers" ADD CONSTRAINT "voice_providers_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
