-- CreateTable
CREATE TABLE "user_language_preferences" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_language_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_language_preferences_botId_waId_idx" ON "user_language_preferences"("botId", "waId");

-- CreateIndex
CREATE UNIQUE INDEX "user_language_preferences_botId_waId_key" ON "user_language_preferences"("botId", "waId");
