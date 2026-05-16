import { PrismaClient, RecipientStatus } from '@prisma/client';

export interface CampaignRecipientForTracking {
  id: string;
  campaignId: string;
  status: RecipientStatus;
  messageId: string | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  repliedAt: Date | null;
}

export interface CampaignRecipientWithCampaign {
  id: string;
  campaignId: string;
  status: RecipientStatus;
  messageId: string | null;
}

export interface ICampaignRecipientRepository {
  batchCreate(versionId: string, recipients: Array<{ waId: string; variables: any }>): Promise<any[]>;
  findPendingByVersion(versionId: string, limit?: number, cursorId?: string): Promise<any[]>;
  updateStatus(id: string, status: RecipientStatus, sentAt?: Date): Promise<void>;
  updateStatusWithStats(id: string, campaignId: string, status: RecipientStatus): Promise<void>;
  updateMessageId(id: string, messageId: string): Promise<void>;
  findByCampaignMessageId(messageId: string): Promise<CampaignRecipientForTracking | null>;
  findByRecipientIdWithCampaign(recipientId: string): Promise<CampaignRecipientWithCampaign | null>;
  updateVoiceTerminalStatus(
    recipientId: string,
    campaignId: string,
    status: 'completed' | 'failed',
    providerReference?: string,
  ): Promise<void>;
  updateLifecycle(recipientId: string, campaignId: string, lifecycleField: 'deliveredAt' | 'readAt' | 'repliedAt', statsField: 'delivered' | 'read' | 'replied'): Promise<void>;
}

export class PrismaCampaignRecipientRepository implements ICampaignRecipientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async batchCreate(versionId: string, recipients: Array<{ waId: string; variables: any }>): Promise<any[]> {
    return this.prisma.campaignRecipient.createManyAndReturn({
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

  async updateMessageId(id: string, messageId: string): Promise<void> {
    await this.prisma.campaignRecipient.update({
      where: { id },
      data: { messageId },
    });
  }

  async findByCampaignMessageId(messageId: string): Promise<CampaignRecipientForTracking | null> {
    const recipient = await this.prisma.campaignRecipient.findUnique({
      where: { messageId },
      include: { version: { select: { campaignId: true } } },
    });
    if (!recipient) return null;
    return {
      id: recipient.id,
      campaignId: recipient.version.campaignId,
      status: recipient.status,
      messageId: recipient.messageId,
      deliveredAt: recipient.deliveredAt,
      readAt: recipient.readAt,
      repliedAt: recipient.repliedAt,
    };
  }

  async findByRecipientIdWithCampaign(recipientId: string): Promise<CampaignRecipientWithCampaign | null> {
    const recipient = await this.prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: { version: { select: { campaignId: true } } },
    });

    if (!recipient) return null;

    return {
      id: recipient.id,
      campaignId: recipient.version.campaignId,
      status: recipient.status,
      messageId: recipient.messageId,
    };
  }

  async updateVoiceTerminalStatus(
    recipientId: string,
    campaignId: string,
    status: 'completed' | 'failed',
    providerReference?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.campaignRecipient.findUnique({
        where: { id: recipientId },
        select: { status: true, messageId: true, sentAt: true },
      });

      if (!current) {
        return;
      }

      const recipientData: Record<string, unknown> = {};

      if (current.status !== status) {
        recipientData['status'] = status;
      }

      if (status === RecipientStatus.completed && !current.sentAt) {
        recipientData['sentAt'] = new Date();
      }

      if (providerReference && !current.messageId) {
        recipientData['messageId'] = providerReference;
      }

      if (Object.keys(recipientData).length > 0) {
        await tx.campaignRecipient.update({
          where: { id: recipientId },
          data: recipientData,
        });
      }

      const alreadyTerminal = current.status === RecipientStatus.completed || current.status === RecipientStatus.failed;
      if (alreadyTerminal) {
        return;
      }

      const statsData: Record<string, unknown> = {
        ...(status === RecipientStatus.completed ? { completed: { increment: 1 } } : {}),
        ...(status === RecipientStatus.failed ? { failed: { increment: 1 } } : {}),
        ...(current.status === RecipientStatus.pending ? { pending: { decrement: 1 } } : {}),
      };

      if (Object.keys(statsData).length > 0) {
        await tx.campaignStats.update({
          where: { campaignId },
          data: statsData,
        });
      }
    });
  }

  async updateLifecycle(
    recipientId: string,
    campaignId: string,
    lifecycleField: 'deliveredAt' | 'readAt' | 'repliedAt',
    statsField: 'delivered' | 'read' | 'replied',
  ): Promise<void> {
    const statusMap: Record<string, RecipientStatus> = {
      deliveredAt: RecipientStatus.delivered,
      readAt: RecipientStatus.read,
      repliedAt: RecipientStatus.replied,
    };
    await this.prisma.$transaction([
      this.prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { [lifecycleField]: new Date(), status: statusMap[lifecycleField] },
      }),
      this.prisma.campaignStats.update({
        where: { campaignId },
        data: { [statsField]: { increment: 1 } },
      }),
    ]);
  }
}
