import type { IPluginRegistry } from '../../plugin.interface';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from '../../whatsapp';
import { NodeType } from '../../../schemas/node-types.enum';
import type { OutboundJob } from '../jobs';

export async function handleOutboundJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as OutboundJob;
  const { waId, messageType, payload } = job;

  console.log(`[OutboundConsumer] Sending ${messageType} to ${waId}`);

  const { sender } = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  const p = payload;

  // Build a single OutboundMessage and delegate to the central sender.
  await sender.sendMessages(waId, [{ type: messageType as NodeType, payload: p }], job.sessionId);

  console.log(`[OutboundConsumer] Sent ${messageType} to ${waId}`);
}
