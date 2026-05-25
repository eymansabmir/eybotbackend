import { ActivityLog } from './activity-log.entity';

export interface ActivityLogFilter {
  orgId: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ActivityLogRepository {
  create(log: ActivityLog): Promise<ActivityLog>;
  findMany(filter: ActivityLogFilter): Promise<{ logs: ActivityLog[]; total: number }>;
  findById(id: string): Promise<ActivityLog | null>;
}
