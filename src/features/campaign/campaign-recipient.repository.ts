import { PrismaClient, RecipientStatus } from '@prisma/client';

export interface ICampaignRecipientRepository {
  batchCreate(versionId: string, recipients: Array<{ waId: string; variables: any }>): Promise<void>;
  findPendingByVersion(versionId: string, limit?: number, cursorId?: string): Promise<any[]>;
  updateStatus(id: string, status: RecipientStatus, sentAt?: Date): Promise<void>;
  updateStatusWithStats(id: string, campaignId: string, status: RecipientStatus): Promise<void>;
}

export class PrismaCampaignRecipientRepository implements ICampaignRecipientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async batchCreate(versionId: string, recipients: Array<{ waId: string; variables: any }>): Promise<void> {
    await this.prisma.campaignRecipient.createMany({
      data: recipients.map(r => ({
        campaignVersionId: versionId,
        waId: r.waId,
        variables: r.variables,
        status: RecipientStatus.pending,
      })),
    });
  }

  async findPendingByVersion(versionId: string, limit: number = 1000, cursorId?: string): Promise<any[]> {
    return this.prisma.campaignRecipient.findMany({
      where: {
        campaignVersionId: versionId,
        status: RecipientStatus.pending,
      },
      take: limit,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      orderBy: { id: 'asc' },
    });
  }

  async updateStatus(id: string, status: RecipientStatus, sentAt?: Date): Promise<void> {
    await this.prisma.campaignRecipient.update({
      where: { id },
      data: {
        status,
        sentAt: sentAt ?? null,
      },
    });
  }

  async updateStatusWithStats(id: string, campaignId: string, status: RecipientStatus): Promise<void> {
    const isCompleted = status === RecipientStatus.completed;
    const isFailed = status === RecipientStatus.failed;

    await this.prisma.$transaction([
      this.prisma.campaignRecipient.update({
        where: { id },
        data: { 
          status, 
          sentAt: isCompleted ? new Date() : null 
        },
      }),
      this.prisma.campaignStats.update({
        where: { campaignId },
        data: {
          ...(isCompleted ? { sent: { increment: 1 } } : {}),
          ...(isFailed ? { failed: { increment: 1 } } : {}),
          pending: { decrement: 1 },
        },
      }),
    ]);
  }
}
