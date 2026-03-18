import type { IPluginRegistry } from '../../plugin.interface';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from '../../whatsapp';
import { NodeType } from '../../../schemas/node-types.enum';
import type { OutboundJob } from '../jobs';

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
    await sender.sendMessages(waId, [{ type: messageType as NodeType, payload: p }], sessionId);

    logger.info({ waId, messageType, sessionId }, 'OutboundConsumer: message sent successfully');
  } catch (err) {
    logger.error(
      { waId, messageType, sessionId, err },
      'OutboundConsumer: failed to send message',
    );
    throw err;
  }
}
