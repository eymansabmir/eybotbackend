import { Request, Response } from 'express';
import { z } from 'zod';
import { IPluginRegistry } from '../../plugins/plugin.interface';
import { WORKER_PLUGIN, EXCHANGES, IWorkerPlugin } from '../../plugins/worker';
import { TriggerJob } from '../../plugins/worker/jobs';

const triggerSchema = z.object({
  botId: z.string().uuid(),
  batchId: z.string().optional(),
  campaignName: z.string().optional(),
  autoStart: z.boolean().optional().default(true),
  data: z.array(z.object({
    to: z.string().min(10),
    variables: z.record(z.unknown())
  })).min(1).max(500)
});

export class TriggerController {
  constructor(private readonly registry: IPluginRegistry) {}

  trigger = async (req: Request, res: Response): Promise<void> => {
    const auth = (req as any).auth;
    const orgId = auth?.session?.user?.orgId || '68b08633907a113536238290';
    
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

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
        batchId: validation.data.batchId,
        campaignName: validation.data.campaignName,
        autoStart: validation.data.autoStart,
        data: validation.data.data
      };

      await worker.publish(EXCHANGES.BOT_TRIGGER, job);

      res.status(202).json({ 
        message: 'Batch accepted', 
        batchId: job.batchId,
        count: job.data.length 
      });
    } catch (err) {
      logger.error({ err }, 'TriggerController: failed to publish job');
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
