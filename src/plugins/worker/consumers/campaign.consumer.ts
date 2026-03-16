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
  logger.info(
    { campaignId: job.campaignId, recipientCount: job.recipients.length },
    'CampaignConsumer: processing campaign batch',
  );

  const { sender } = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  let sent = 0;
  let failed = 0;

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
      sent++;
    } catch (err) {
      failed++;
      logger.error({ campaignId: job.campaignId, waId, err }, 'CampaignConsumer: failed to send to recipient');
      // Continue — don't fail the entire campaign for one recipient
    }
  }

  logger.info({ campaignId: job.campaignId, sent, failed }, 'CampaignConsumer: campaign batch complete');
}
