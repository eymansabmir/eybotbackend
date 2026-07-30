-- CreateTable
CREATE TABLE "wa_flow_surveys" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "interaktFlowId" TEXT NOT NULL,
    "templateName" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_flow_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_flow_submissions" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "waBusinessNumber" TEXT NOT NULL,
    "credentialId" TEXT,
    "providerMessageId" TEXT NOT NULL,
    "contextMessageId" TEXT,
    "flowToken" TEXT,
    "templateName" TEXT,
    "interaktFlowId" TEXT NOT NULL,
    "callbackData" TEXT,
    "rawPayload" JSONB NOT NULL,
    "responseJson" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_flow_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_flow_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_flow_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wa_flow_surveys_orgId_idx" ON "wa_flow_surveys"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_flow_surveys_orgId_interaktFlowId_key" ON "wa_flow_surveys"("orgId", "interaktFlowId");

-- CreateIndex
CREATE INDEX "wa_flow_submissions_orgId_surveyId_submittedAt_idx" ON "wa_flow_submissions"("orgId", "surveyId", "submittedAt");

-- CreateIndex
CREATE INDEX "wa_flow_submissions_orgId_waId_idx" ON "wa_flow_submissions"("orgId", "waId");

-- CreateIndex
CREATE UNIQUE INDEX "wa_flow_submissions_orgId_providerMessageId_key" ON "wa_flow_submissions"("orgId", "providerMessageId");

-- CreateIndex
CREATE INDEX "wa_flow_answers_orgId_surveyId_questionKey_valueText_idx" ON "wa_flow_answers"("orgId", "surveyId", "questionKey", "valueText");

-- CreateIndex
CREATE INDEX "wa_flow_answers_submissionId_idx" ON "wa_flow_answers"("submissionId");

-- AddForeignKey
ALTER TABLE "wa_flow_submissions" ADD CONSTRAINT "wa_flow_submissions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "wa_flow_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_flow_answers" ADD CONSTRAINT "wa_flow_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "wa_flow_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
