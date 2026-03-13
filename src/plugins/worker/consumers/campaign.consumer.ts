import type { IPluginRegistry } from '../../plugin.interface';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from '../../whatsapp';
import { NodeType } from '../../../schemas/node-types.enum';
import type { CampaignJob } from '../jobs';

/**
 * Campaign consumer — processes broadcast campaign jobs.
 *
 * Because the campaign exchange is fanout, EVERY running instance receives
 * EVERY campaign message. Partition recipients across instances using
 * the instance index or a consistent-hash approach when you need to scale.
 * For now each instance sends to all its assigned recipients.
 */
export async function handleCampaignJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as CampaignJob;
  console.log(`[CampaignConsumer] Processing campaign ${job.campaignId} for ${job.recipients.length} recipients`);

  const { sender } = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);

  for (const waId of job.recipients) {
    try {
      await sender.sendMessages(waId, [{
        type: NodeType.SEND_TEMPLATE,
        payload: {
          templateName: job.templateName,
          languageCode: job.languageCode,
          components: job.components,
        },
      }]);
    } catch (err) {
      console.error(`[CampaignConsumer] Failed to send to ${waId}:`, err);
      // Continue — don't fail the entire campaign for one recipient
    }
  }

  console.log(`[CampaignConsumer] Campaign ${job.campaignId} done`);
}
