import { PrismaClient } from '@prisma/client';
import { ActivityLog } from '../domain/activity-log.entity';
import { ActivityLogRepository, ActivityLogFilter } from '../domain/activity-log.repository';
import { ActivityAction, ActivityEntityType } from '../domain/activity-log.types';

export class PrismaActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(log: ActivityLog): Promise<ActivityLog> {
    const created = await this.prisma.activityLog.create({
      data: {
        orgId: log.orgId,
        userId: log.userId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata as any,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      },
    });

    return this.mapToEntity(created);
  }

  async findMany(filter: ActivityLogFilter): Promise<{ logs: ActivityLog[]; total: number }> {
    const where: any = {
      orgId: filter.orgId,
    };

    if (filter.userId) where.userId = filter.userId;
    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.action) where.action = filter.action;
    
    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) where.createdAt.gte = filter.startDate;
      if (filter.endDate) where.createdAt.lte = filter.endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filter.limit || 50,
        skip: filter.offset || 0,
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return {
      logs: logs.map(this.mapToEntity),
      total,
    };
  }

  async findById(id: string): Promise<ActivityLog | null> {
    const log = await this.prisma.activityLog.findUnique({
      where: { id },
    });

    return log ? this.mapToEntity(log) : null;
  }

  private mapToEntity(data: any): ActivityLog {
    return new ActivityLog({
      id: data.id,
      orgId: data.orgId,
      userId: data.userId,
      action: data.action as ActivityAction,
      entityType: data.entityType as ActivityEntityType,
      entityId: data.entityId,
      metadata: data.metadata,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      createdAt: data.createdAt,
    });
  }
}
