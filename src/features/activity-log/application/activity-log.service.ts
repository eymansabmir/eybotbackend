import { ActivityLogRepository, ActivityLogFilter } from '../domain/activity-log.repository';
import { ActivityLog, ActivityLogProperties } from '../domain/activity-log.entity';

export class ActivityLogService {
  constructor(private readonly activityLogRepo: ActivityLogRepository) {}

  /**
   * Records a new activity log entry.
   */
  async record(props: Omit<ActivityLogProperties, 'createdAt' | 'id'>): Promise<ActivityLog> {
    const log = new ActivityLog(props);
    return this.activityLogRepo.create(log);
  }

  /**
   * Lists activity logs for an organization with filtering and pagination.
   */
  async getLogs(filter: ActivityLogFilter): Promise<{ logs: ActivityLog[]; total: number }> {
    return this.activityLogRepo.findMany(filter);
  }

  /**
   * Retrieves a specific log entry by ID.
   */
  async getLogById(id: string): Promise<ActivityLog | null> {
    return this.activityLogRepo.findById(id);
  }
}
