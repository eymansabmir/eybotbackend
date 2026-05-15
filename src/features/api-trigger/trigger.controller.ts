import { Request, Response } from 'express';
import { z } from 'zod';
import { IPluginRegistry } from '../../plugins/plugin.interface';
import { WORKER_PLUGIN, EXCHANGES, IWorkerPlugin } from '../../plugins/worker';
import { TriggerJob } from '../../plugins/worker/jobs';

const triggerSchema = z.object({
  botId: z.string().uuid(),
  campaignName: z.string().min(1, "Campaign name is required"),
  executionMode: z.enum(["NOW", "SCHEDULED"]).default("NOW"),
  executeAt: z.string().datetime().optional(), // ISO string validation
  data: z.array(z.object({
    to: z.string().min(10),
    variables: z.record(z.unknown())
  })).min(1).max(500)
});

// Transactional trigger (max 100 records, no campaign overhead)
const initiateSchema = z.object({
  botId: z.string().uuid(),
  data: z.array(z.object({
    to: z.string().min(10),
    variables: z.record(z.unknown())
  })).min(1).max(100) // Stricter limit for transactional bursts
});

export class TriggerController {
  constructor(private readonly registry: IPluginRegistry) {}

  /**
   * POST /v1/trigger/initiate
   * Transactional bot trigger for small batches.
   */
  initiate = async (req: Request, res: Response): Promise<void> => {
    const auth = (req as any).auth;
    const orgId = auth?.session?.user?.orgId;
    
    const validation = initiateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid payload', details: validation.error.format() });
      return;
    }

    try {
      const worker = this.registry.get<IWorkerPlugin>(WORKER_PLUGIN);
      const job: TriggerJob = {
        orgId,
        botId: validation.data.botId,
        campaignName: 'Direct API Initiation', // Grouped internally
        executionMode: 'NOW',
        data: validation.data.data
      };

      await worker.publish(EXCHANGES.BOT_TRIGGER, job);

      res.status(202).json({ 
        message: 'Direct initiation accepted', 
        count: job.data.length 
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  trigger = async (req: Request, res: Response): Promise<void> => {
    const auth = (req as any).auth;
    const orgId = auth?.session?.user?.orgId;
    
    const validation = triggerSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid payload', details: validation.error.format() });
      return;
    }

    try {
      const worker = this.registry.get<IWorkerPlugin>(WORKER_PLUGIN);
      const job: TriggerJob = {
        orgId,
        botId: validation.data.botId,
        campaignName: validation.data.campaignName,
        executionMode: validation.data.executionMode,
        executeAt: validation.data.executeAt,
        data: validation.data.data
      };

      await worker.publish(EXCHANGES.BOT_TRIGGER, job);

      res.status(202).json({ 
        message: 'Data ingestion accepted', 
        campaignName: job.campaignName,
        executionMode: job.executionMode,
        count: job.data.length 
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
