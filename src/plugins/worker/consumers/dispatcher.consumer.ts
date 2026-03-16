import { IPluginRegistry } from '../../plugin.interface';
import { DispatchJob, RecipientJob } from '../jobs';
import { WORKER_PLUGIN, EXCHANGES, IWorkerPlugin } from '../worker.interface';
import { CAMPAIGN_REPOSITORY, CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

const PAGE_SIZE = 500;

export async function handleDispatchJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as DispatchJob;
  logger.info({ campaignId: job.campaignId, versionId: job.campaignVersionId }, 'DispatchWorker: starting dispatch');

  try {
    const campaignRepo = registry.get<ICampaignRepository>(CAMPAIGN_REPOSITORY);
    const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
    const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);

    let cursor: string | undefined = undefined;
    let dispatchedTotal = 0;

    while (true) {
      const recipients = await recipientRepo.findPendingByVersion(job.campaignVersionId, PAGE_SIZE, cursor);
      if (recipients.length === 0) break;

      for (const recipient of recipients) {
        const execJob: RecipientJob = {
          campaignId: job.campaignId,
          campaignVersionId: job.campaignVersionId,
          recipientId: recipient.id,
          waId: recipient.waId,
          variables: recipient.variables as Record<string, any>,
          orgId: job.orgId,
        };
        await workerPlugin.publish(EXCHANGES.CAMPAIGN_DISPATCH, execJob);
        dispatchedTotal++;
      }

      cursor = recipients[recipients.length - 1].id;
      logger.debug({ campaignId: job.campaignId, dispatched: dispatchedTotal }, 'DispatchWorker: page dispatched');
    }

    await campaignRepo.updateStats(job.campaignId, { pending: dispatchedTotal });
    logger.info({ campaignId: job.campaignId, total: dispatchedTotal }, 'DispatchWorker: all jobs dispatched');

  } catch (err) {
    logger.error({ campaignId: job.campaignId, err }, 'DispatchWorker: dispatch failed');
    throw err;
  }
}
