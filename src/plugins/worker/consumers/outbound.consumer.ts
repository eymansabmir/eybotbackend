import type { IPluginRegistry } from '../../plugin.interface';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from '../../whatsapp';
import { NodeType } from '../../../schemas/node-types.enum';
import type { OutboundJob } from '../jobs';
import { CAMPAIGN_RECIPIENT_REPOSITORY } from '../../../features/repositories.interface';
import type { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';

export async function handleOutboundJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as OutboundJob;
  const { waId, messageType, payload, sessionId } = job;

  logger.info(
    { waId, messageType, sessionId, payloadKeys: Object.keys(payload) },
    'OutboundConsumer: processing outbound job',
  );

  try {
    const { sender } = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
    const p = payload;

    // Build a single OutboundMessage and delegate to the central sender.
    const metaMessageId = await sender.sendMessages(waId, [{ type: messageType as NodeType, payload: p }], sessionId);

    // If this is the first message of a campaign broadcast, persist Meta's message_id
    // so we can correlate delivery/read status callbacks back to this recipient.
    if (job.campaignRecipientId && metaMessageId) {
      try {
        const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
        await recipientRepo.updateMessageId(job.campaignRecipientId, metaMessageId);
        logger.info({ campaignRecipientId: job.campaignRecipientId, metaMessageId }, 'OutboundConsumer: campaign message_id saved');
      } catch (err) {
        logger.error({ campaignRecipientId: job.campaignRecipientId, err }, 'OutboundConsumer: failed to save campaign message_id');
      }
    }

    logger.info({ waId, messageType, sessionId }, 'OutboundConsumer: message sent successfully');

    // Small delay so Meta delivers messages in the order they were sent.
    // Without this, Meta's async delivery can reorder messages even when sent sequentially.
    const delayMs = Number(process.env.OUTBOUND_MESSAGE_DELAY_MS ?? 500);
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  } catch (err) {
    logger.error(
      { waId, messageType, sessionId, err },
      'OutboundConsumer: failed to send message',
    );
    throw err;
  }
}
