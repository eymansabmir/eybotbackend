import { IPluginRegistry } from '../../plugin.interface';
import { WORKER_PLUGIN, IWorkerPlugin } from '../../worker';
import { DispatchJob } from '../jobs';
import { CampaignStatus } from '@prisma/client';
import { EXCHANGES } from '../../worker';
import { CAMPAIGN_REPOSITORY, CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

export async function handleDispatchJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as DispatchJob;
  console.log(`[DispatcherWorker] Dispatching campaign ${job.campaignId} (version ${job.campaignVersionId})`);

  try {
    const worker = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
    const campaignRepo = registry.get<ICampaignRepository>(CAMPAIGN_REPOSITORY);
    const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);

    // 1. Mark campaign as running
    await campaignRepo.update(job.campaignId, {
      status: CampaignStatus.running,
      activeVersionId: job.campaignVersionId
    });

    // 2. Fetch recipients in chunks and send to dispatch queue
    const batchSize = 500;
    let cursor: string | undefined;

    while (true) {
      const recipients = await recipientRepo.findPendingByVersion(job.campaignVersionId, batchSize, cursor);

      if (recipients.length === 0) break;

      for (const recipient of recipients) {
        // Publish individual RecipientJob
        await worker.publish(EXCHANGES.CAMPAIGN_DISPATCH, {
          campaignId: job.campaignId,
          campaignVersionId: job.campaignVersionId,
          recipientId: recipient.id,
          waId: recipient.waId,
          variables: recipient.variables as Record<string, any>,
          orgId: job.orgId,
        });
      }

      cursor = recipients[recipients.length - 1]!.id;
    }

    console.log(`[DispatcherWorker] Dispatch complete for campaign ${job.campaignId}`);
  } catch (error) {
    console.error(`[DispatcherWorker] Failed to dispatch campaign ${job.campaignId}:`, error);
  }
}
