import { Request, Response } from 'express';
import { z } from 'zod';
import { ActivityLogService } from '../application/activity-log.service';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const ActivityLogQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1, 'orgId is required')),
  userId: z.preprocess(pickFirst, z.string().optional()),
  entityType: z.preprocess(pickFirst, z.string().optional()),
  entityId: z.preprocess(pickFirst, z.string().optional()),
  action: z.preprocess(pickFirst, z.string().optional()),
  startDate: z.preprocess(pickFirst, z.string().optional().transform(v => v ? new Date(v) : undefined)),
  endDate: z.preprocess(pickFirst, z.string().optional().transform(v => v ? new Date(v) : undefined)),
  limit: z.preprocess(pickFirst, z.string().optional().transform(v => v ? parseInt(v, 10) : undefined)),
  offset: z.preprocess(pickFirst, z.string().optional().transform(v => v ? parseInt(v, 10) : undefined)),
});

export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  async getLogs(req: Request, res: Response) {
    try {
      const query = ActivityLogQuerySchema.parse(req.query);
      const result = await this.activityLogService.getLogs(query);

      return res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      global.logger.error({ error, query: req.query }, 'Failed to fetch activity logs');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getLogById(req: Request, res: Response) {
    const id = req.params.id as string;
    try {
      const log = await this.activityLogService.getLogById(id);
      if (!log) {
        return res.status(404).json({ error: 'Log not found' });
      }
      return res.json(log);
    } catch (error: any) {
      global.logger.error({ error, id }, 'Failed to fetch activity log by ID');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}
