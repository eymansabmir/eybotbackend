import type { IPluginRegistry } from '../../plugin.interface';
import { WORKER_PLUGIN, EXCHANGES, type IWorkerPlugin } from '../worker.interface';
import { INBOUND_HANDLER, type IInboundHandler } from '../handlers.interface';
import type { InboundJob } from '../jobs';

export async function handleInboundJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as InboundJob;

  console.log(`[InboundConsumer] Processing message ${job.message.messageId} for ${job.message.waId}`);

  const handler = registry.get<IInboundHandler>(INBOUND_HANDLER);
  const outboundJobs = await handler.process(job);

  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  for (const outboundJob of outboundJobs) {
    await workerPlugin.publish(EXCHANGES.OUTBOUND, outboundJob);
  }

  console.log(`[InboundConsumer] Completed message ${job.message.messageId}`);
}
