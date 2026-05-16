import { IPluginRegistry } from '../../plugin.interface';
import { TriggerJob } from '../jobs';
import { CAMPAIGN_SERVICE } from '../../../features/repositories.interface';
import { CampaignService } from '../../../features/campaign/campaign.service';

export async function handleTriggerJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as TriggerJob;
  const campaignService = registry.get<CampaignService>(CAMPAIGN_SERVICE);

  try {
    await campaignService.processApiTrigger(job);
  } catch (err) {
    logger.error({ botId: job.botId, err }, 'TriggerWorker: batch failed');
    throw err;
  }
}
