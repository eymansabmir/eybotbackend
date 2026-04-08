import type { IPluginRegistry } from '../../plugin.interface';
import { WORKER_PLUGIN, EXCHANGES, type IWorkerPlugin } from '../worker.interface';
import type { IInboundHandler } from '../handlers.interface';
import { INBOUND_HANDLER, CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import type { InboundJob } from '../jobs';
import type { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

export async function handleInboundJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as InboundJob;

  logger.info({ messageId: job.message.messageId, waId: job.message.waId }, 'InboundConsumer: processing message');

  try {
    const handler = registry.get<IInboundHandler>(INBOUND_HANDLER);
    const outboundJobs = await handler.process(job);

    logger.info(
      {
        messageId: job.message.messageId,
        outboundCount: outboundJobs.length,
        types: outboundJobs.map((j, idx) => `${idx}: ${j.messageType}`),
      },
      'InboundConsumer: outbound jobs generated',
    );

    const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
    for (const [index, outboundJob] of outboundJobs.entries()) {
      logger.info(
        {
          messageId: job.message.messageId,
          index,
          messageType: outboundJob.messageType,
          sessionId: outboundJob.sessionId,
        },
        'InboundConsumer: publishing outbound job',
      );
      // Use sessionId as routing key to ensure all messages for same session go to same worker
      await workerPlugin.publish(EXCHANGES.OUTBOUND, outboundJob, outboundJob.sessionId || '');
    }

    // Reply tracking: if this message is a reply to a campaign broadcast, mark the recipient as replied
    if (job.message.contextMessageId) {
      try {
        const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
        const recipient = await recipientRepo.findByCampaignMessageId(job.message.contextMessageId);
        if (recipient && !recipient.repliedAt) {
          await recipientRepo.updateLifecycle(recipient.id, recipient.campaignId, 'repliedAt', 'replied');
          logger.info({ contextMessageId: job.message.contextMessageId, recipientId: recipient.id }, 'InboundConsumer: campaign reply tracked');
        }
      } catch (err) {
        logger.error({ contextMessageId: job.message.contextMessageId, err }, 'InboundConsumer: failed to track campaign reply');
      }
    }

    logger.info({ messageId: job.message.messageId, outboundCount: outboundJobs.length }, 'InboundConsumer: message processed');
  } catch (err) {
    logger.error({ messageId: job.message.messageId, err }, 'InboundConsumer: failed to process message');
    throw err;
  }
}
