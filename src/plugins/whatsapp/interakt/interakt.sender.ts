import { NodeType } from '../../../schemas/node-types.enum';
import type { OutboundMessage } from '../../engine/engine.interface';
import type { IWhatsAppSender } from '../whatsapp.interface';
import {
  InteraktAPIService,
  mapMetaComponentsToInterakt,
} from './interakt-api.service';

/**
 * Outbound sender for Interakt public message API.
 * Supported today: SEND_TEMPLATE, SEND_STICKER (URL). Other node types are skipped with a warning.
 */
export class InteraktSender implements IWhatsAppSender {
  constructor(private readonly api: InteraktAPIService) {}

  async sendMessages(
    waId: string,
    messages: OutboundMessage[],
    sessionId?: string,
  ): Promise<string | undefined> {
    let firstMessageId: string | undefined;
    for (const msg of messages) {
      try {
        const messageId = await this.send(waId, msg, sessionId);
        if (firstMessageId === undefined && messageId) firstMessageId = messageId;
      } catch (err) {
        logger.error({ waId, messageType: msg.type, err }, 'InteraktSender: failed to send message');
        throw err;
      }
    }
    return firstMessageId;
  }

  private async send(
    waId: string,
    msg: OutboundMessage,
    sessionId?: string,
  ): Promise<string | undefined> {
    const p = msg.payload;
    const callbackData = sessionId;

    switch (msg.type) {
      case NodeType.SEND_TEMPLATE: {
        const mapped = mapMetaComponentsToInterakt(p['components'] as unknown[] | undefined);
        return this.api.sendTemplate(
          waId,
          {
            name: p['templateName'] as string,
            languageCode: p['languageCode'] as string,
            ...mapped,
          },
          callbackData,
        );
      }
      case NodeType.SEND_STICKER: {
        const sticker = (p['mediaId'] as string) || (p['url'] as string);
        if (!sticker) {
          logger.warn({ waId }, 'InteraktSender: sticker missing url/mediaId');
          return undefined;
        }
        return this.api.sendSticker(waId, sticker, callbackData);
      }
      default:
        logger.warn(
          { waId, messageType: msg.type },
          'InteraktSender: unsupported message type for Interakt provider — skipped',
        );
        return undefined;
    }
  }

  async uploadMedia(
    url: string,
    _type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
  ): Promise<string> {
    // Interakt expects public media URLs; there is no documented media upload endpoint.
    logger.debug({ url }, 'InteraktSender: uploadMedia passthrough (URL)');
    return url;
  }
}
