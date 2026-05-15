import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { SyncService } from '../campaign/sync.service';

const syncJobSchema = z.object({
  dataSourceId: z.string().uuid(),
  botId: z.string().uuid(),
  name: z.string().min(1),
  sqlQuery: z.string().min(10),
  cursorField: z.string().optional(),
  cronSchedule: z.string().optional().default('0 * * * *'),
});

export class SyncJobController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly syncService: SyncService
  ) {}

  create = async (req: Request, res: Response) => {
    const validation = syncJobSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid data', details: validation.error.format() });
    }

    const job = await this.prisma.syncJob.create({
      data: {
        ...validation.data,
      }
    });

    res.status(201).json(job);
  }

  list = async (req: Request, res: Response) => {
    const { dataSourceId } = req.query;
    const jobs = await this.prisma.syncJob.findMany({
      where: dataSourceId ? { dataSourceId: String(dataSourceId) } : {},
      include: { dataSource: { select: { name: true } } }
    });
    res.json(jobs);
  }

  runNow = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await this.syncService.runSyncJob(id);
      res.json({ message: 'Sync started successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  delete = async (req: Request, res: Response) => {
    const { id } = req.params;
    await this.prisma.syncJob.delete({ where: { id } });
    res.status(204).send();
  }
}
