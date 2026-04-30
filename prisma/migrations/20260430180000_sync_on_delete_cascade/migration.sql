-- DropForeignKey
ALTER TABLE "voice_providers" DROP CONSTRAINT IF EXISTS "voice_providers_credentialId_fkey";

-- AddForeignKey
ALTER TABLE "voice_providers" ADD CONSTRAINT "voice_providers_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
