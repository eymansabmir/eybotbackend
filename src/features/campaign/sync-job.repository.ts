import { PrismaClient, SyncJob, SyncStatus } from '@prisma/client';

export interface ISyncJobRepository {
  findById(id: string): Promise<(SyncJob & { dataSource: any }) | null>;
  findDueJobs(now: Date): Promise<SyncJob[]>;
  updateStatus(id: string, data: { status: SyncStatus, lastError?: string | null, lastSyncAt?: Date }): Promise<void>;
  updateCursorAndStats(id: string, data: { lastCursor: string | null, lastSyncAt: Date, incrementProcessed: number }): Promise<void>;
  updateNextSync(id: string, nextSyncAt: Date): Promise<void>;
}

export class PrismaSyncJobRepository implements ISyncJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<(SyncJob & { dataSource: any }) | null> {
    return this.prisma.syncJob.findUnique({
      where: { id },
      include: { dataSource: true }
    }) as any;
  }

  async findDueJobs(now: Date): Promise<SyncJob[]> {
    return this.prisma.syncJob.findMany({
      where: {
        isActive: true,
        OR: [
          { nextSyncAt: { lte: now } },
          { lastSyncAt: null }
        ]
      }
    });
  }

  async updateStatus(id: string, data: { status: SyncStatus, lastError?: string | null, lastSyncAt?: Date }): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id },
      data: {
        status: data.status,
        lastError: data.lastError,
        lastSyncAt: data.lastSyncAt
      }
    });
  }

  async updateCursorAndStats(id: string, data: { lastCursor: string | null, lastSyncAt: Date, incrementProcessed: number }): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id },
      data: {
        status: 'SUCCESS',
        lastCursor: data.lastCursor,
        lastSyncAt: data.lastSyncAt,
        totalRecordsProcessed: { increment: data.incrementProcessed }
      }
    });
  }

  async updateNextSync(id: string, nextSyncAt: Date): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id },
      data: { nextSyncAt }
    });
  }
}
