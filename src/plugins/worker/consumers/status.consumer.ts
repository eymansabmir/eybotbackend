import type { IPluginRegistry } from '../../plugin.interface';
import type { StatusUpdateJob } from '../jobs';
import { CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import type { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

export async function handleStatusUpdateJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as StatusUpdateJob;
  logger.info({ messageId: job.messageId, status: job.status }, 'StatusConsumer: processing status update');

  const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);

  const recipient = await recipientRepo.findByCampaignMessageId(job.messageId);
  if (!recipient) {
    // Not a campaign message — silently ignore
    logger.debug({ messageId: job.messageId }, 'StatusConsumer: no campaign recipient found, skipping');
    return;
  }

  if (job.status === 'delivered') {
    if (recipient.deliveredAt) {
      logger.debug({ messageId: job.messageId }, 'StatusConsumer: already delivered, idempotency skip');
      return;
    }
    await recipientRepo.updateLifecycle(recipient.id, recipient.campaignId, 'deliveredAt', 'delivered');
    logger.info({ messageId: job.messageId, recipientId: recipient.id }, 'StatusConsumer: marked delivered');
    return;
  }

  if (job.status === 'read') {
    if (recipient.readAt) {
      logger.debug({ messageId: job.messageId }, 'StatusConsumer: already read, idempotency skip');
      return;
    }
    await recipientRepo.updateLifecycle(recipient.id, recipient.campaignId, 'readAt', 'read');
    logger.info({ messageId: job.messageId, recipientId: recipient.id }, 'StatusConsumer: marked read');
  }
}
