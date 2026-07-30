import type { PrismaClient } from '@prisma/client';
import type { IWaFlowSurveyRepository } from '../domain/wa-flow-survey.repository';
import type {
  StoreFlowResponseInput,
  WaFlowSubmissionListItem,
  WaFlowSurveyAnalytics,
  WaFlowSurveyListItem,
} from '../domain/wa-flow-survey.types';

export class PrismaWaFlowSurveyRepository implements IWaFlowSurveyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async storeFlowResponse(
    input: StoreFlowResponseInput,
  ): Promise<{ surveyId: string; submissionId: string; created: boolean }> {
    const existing = await this.prisma.waFlowSubmission.findUnique({
      where: {
        orgId_providerMessageId: {
          orgId: input.orgId,
          providerMessageId: input.providerMessageId,
        },
      },
      select: {
        id: true,
        surveyId: true,
        interaktFlowId: true,
        templateName: true,
        responseJson: true,
      },
    });
    if (existing) {
      // Upgrade orphan rows that were stored before flow_id/template arrived.
      const incomingKeys = Object.keys(input.responseJson ?? {}).filter((k) => k !== 'flow_token');
      const existingKeys = Object.keys((existing.responseJson as object) ?? {}).filter(
        (k) => k !== 'flow_token',
      );
      const shouldUpgrade =
        (Boolean(input.templateName) && !existing.templateName) ||
        (input.interaktFlowId !== existing.interaktFlowId &&
          /^\d+$/.test(input.interaktFlowId) &&
          !/^\d+$/.test(existing.interaktFlowId)) ||
        incomingKeys.length > existingKeys.length;

      if (!shouldUpgrade) {
        return { surveyId: existing.surveyId, submissionId: existing.id, created: false };
      }

      return this.upgradeFlowSubmission(existing.id, input);
    }

    const title = input.templateName?.trim() || `Flow ${input.interaktFlowId}`;

    return this.prisma.$transaction(async (tx) => {
      const survey = await tx.waFlowSurvey.upsert({
        where: {
          orgId_interaktFlowId: {
            orgId: input.orgId,
            interaktFlowId: input.interaktFlowId,
          },
        },
        create: {
          orgId: input.orgId,
          interaktFlowId: input.interaktFlowId,
          templateName: input.templateName,
          title,
        },
        update: {
          ...(input.templateName ? { templateName: input.templateName } : {}),
          updatedAt: new Date(),
        },
      });

      const submission = await tx.waFlowSubmission.create({
        data: {
          orgId: input.orgId,
          surveyId: survey.id,
          waId: input.waId,
          waBusinessNumber: input.waBusinessNumber,
          credentialId: input.credentialId,
          providerMessageId: input.providerMessageId,
          contextMessageId: input.contextMessageId,
          flowToken: input.flowToken,
          templateName: input.templateName,
          interaktFlowId: input.interaktFlowId,
          callbackData: input.callbackData,
          rawPayload: input.rawPayload as object,
          responseJson: input.responseJson as object,
          submittedAt: input.submittedAt,
          answers: {
            create: input.answers.map((a) => ({
              orgId: input.orgId,
              surveyId: survey.id,
              questionKey: a.questionKey,
              questionLabel: a.questionLabel,
              valueText: a.valueText,
            })),
          },
        },
      });

      return { surveyId: survey.id, submissionId: submission.id, created: true };
    });
  }

  /** Move/replace a submission onto the real Interakt flow survey with fresher answers. */
  private async upgradeFlowSubmission(
    submissionId: string,
    input: StoreFlowResponseInput,
  ): Promise<{ surveyId: string; submissionId: string; created: boolean }> {
    const title = input.templateName?.trim() || `Flow ${input.interaktFlowId}`;

    return this.prisma.$transaction(async (tx) => {
      const survey = await tx.waFlowSurvey.upsert({
        where: {
          orgId_interaktFlowId: {
            orgId: input.orgId,
            interaktFlowId: input.interaktFlowId,
          },
        },
        create: {
          orgId: input.orgId,
          interaktFlowId: input.interaktFlowId,
          templateName: input.templateName,
          title,
        },
        update: {
          ...(input.templateName ? { templateName: input.templateName } : {}),
          updatedAt: new Date(),
        },
      });

      await tx.waFlowAnswer.deleteMany({ where: { submissionId } });

      await tx.waFlowSubmission.update({
        where: { id: submissionId },
        data: {
          surveyId: survey.id,
          waBusinessNumber: input.waBusinessNumber,
          credentialId: input.credentialId,
          contextMessageId: input.contextMessageId,
          flowToken: input.flowToken,
          templateName: input.templateName,
          interaktFlowId: input.interaktFlowId,
          callbackData: input.callbackData,
          rawPayload: input.rawPayload as object,
          responseJson: input.responseJson as object,
          submittedAt: input.submittedAt,
          answers: {
            create: input.answers.map((a) => ({
              orgId: input.orgId,
              surveyId: survey.id,
              questionKey: a.questionKey,
              questionLabel: a.questionLabel,
              valueText: a.valueText,
            })),
          },
        },
      });

      return { surveyId: survey.id, submissionId, created: true };
    });
  }

  async listSurveys(orgId: string): Promise<WaFlowSurveyListItem[]> {
    const rows = await this.prisma.waFlowSurvey.findMany({
      where: { orgId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { submissions: true } },
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
          select: { submittedAt: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      interaktFlowId: row.interaktFlowId,
      templateName: row.templateName,
      title: row.title,
      submissionCount: row._count.submissions,
      lastSubmittedAt: row.submissions[0]?.submittedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async getSurveyAnalytics(orgId: string, surveyId: string): Promise<WaFlowSurveyAnalytics | null> {
    const survey = await this.prisma.waFlowSurvey.findFirst({
      where: { id: surveyId, orgId },
      include: { _count: { select: { submissions: true } } },
    });
    if (!survey) return null;

    const grouped = await this.prisma.waFlowAnswer.groupBy({
      by: ['questionKey', 'questionLabel', 'valueText'],
      where: { orgId, surveyId },
      _count: { _all: true },
      orderBy: [{ questionKey: 'asc' }, { valueText: 'asc' }],
    });

    const byQuestion = new Map<
      string,
      { questionKey: string; questionLabel: string; totalAnswers: number; options: Array<{ value: string; count: number }> }
    >();

    for (const row of grouped) {
      const key = row.questionKey;
      let entry = byQuestion.get(key);
      if (!entry) {
        entry = {
          questionKey: row.questionKey,
          questionLabel: row.questionLabel,
          totalAnswers: 0,
          options: [],
        };
        byQuestion.set(key, entry);
      }
      const count = row._count._all;
      entry.totalAnswers += count;
      if (row.valueText != null && row.valueText !== '') {
        entry.options.push({ value: row.valueText, count });
      }
    }

    return {
      survey: {
        id: survey.id,
        orgId: survey.orgId,
        interaktFlowId: survey.interaktFlowId,
        templateName: survey.templateName,
        title: survey.title,
        submissionCount: survey._count.submissions,
      },
      questions: Array.from(byQuestion.values()),
    };
  }

  async listSubmissions(
    orgId: string,
    surveyId: string,
    limit: number,
    offset: number,
  ): Promise<{ submissions: WaFlowSubmissionListItem[]; total: number }> {
    const where = { orgId, surveyId };
    const [total, rows] = await Promise.all([
      this.prisma.waFlowSubmission.count({ where }),
      this.prisma.waFlowSubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          waId: true,
          providerMessageId: true,
          templateName: true,
          callbackData: true,
          responseJson: true,
          submittedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      total,
      submissions: rows.map((r) => ({
        id: r.id,
        waId: r.waId,
        providerMessageId: r.providerMessageId,
        templateName: r.templateName,
        callbackData: r.callbackData,
        responseJson: r.responseJson,
        submittedAt: r.submittedAt,
        createdAt: r.createdAt,
      })),
    };
  }
}
