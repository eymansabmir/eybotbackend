import type { IPluginRegistry } from '../../plugin.interface';
import { WORKER_PLUGIN, EXCHANGES, type IWorkerPlugin } from '../worker.interface';
import type { IInboundHandler } from '../handlers.interface';
import { INBOUND_HANDLER } from '../../../features/repositories.interface';
import type { InboundJob } from '../jobs';

export async function handleInboundJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as InboundJob;

  logger.info({ messageId: job.message.messageId, waId: job.message.waId }, 'InboundConsumer: processing message');

  try {
    const handler = registry.get<IInboundHandler>(INBOUND_HANDLER);
    const outboundJobs = await handler.process(job);

    const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
    for (const outboundJob of outboundJobs) {
      await workerPlugin.publish(EXCHANGES.OUTBOUND, outboundJob);
    }

    logger.info({ messageId: job.message.messageId, outboundCount: outboundJobs.length }, 'InboundConsumer: message processed');
  } catch (err) {
    logger.error({ messageId: job.message.messageId, err }, 'InboundConsumer: failed to process message');
    throw err;
  }
}
