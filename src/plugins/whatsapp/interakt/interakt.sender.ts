import { NodeType } from '../../../schemas/node-types.enum';
import type { OutboundMessage } from '../../engine/engine.interface';
import type { IWhatsAppSender } from '../whatsapp.interface';
import {
  InteraktAPIService,
  mapMetaComponentsToInterakt,
  type InteraktListSection,
} from './interakt-api.service';

/**
 * Outbound sender for Interakt public message API.
 * Mirrors DirectWhatsAppSender node mapping for supported Interakt types:
 * Text, InteractiveList, InteractiveReplyButton, Image/Video/Audio/Document, Sticker, Template.
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
      case NodeType.SEND_TEXT:
      case NodeType.ASK_QUESTION:
      case NodeType.ASK_FILE: {
        let message = p['message'] as string;
        const footer = p['footer'] as string | undefined;
        if (footer) message += `\n\n_${footer}_`;
        return this.api.sendText(waId, message, callbackData);
      }

      case NodeType.SEND_IMAGE:
        return this.api.sendMedia(
          waId,
          'Image',
          p['url'] as string,
          p['caption'] as string | undefined,
          undefined,
          callbackData,
        );

      case NodeType.SEND_VIDEO:
        return this.api.sendMedia(
          waId,
          'Video',
          p['url'] as string,
          p['caption'] as string | undefined,
          undefined,
          callbackData,
        );

      case NodeType.SEND_AUDIO:
        return this.api.sendMedia(waId, 'Audio', p['url'] as string, undefined, undefined, callbackData);

      case NodeType.SEND_DOCUMENT:
        return this.api.sendMedia(
          waId,
          'Document',
          p['url'] as string,
          p['caption'] as string | undefined,
          p['filename'] as string | undefined,
          callbackData,
        );

      case NodeType.SEND_BUTTONS:
        return this.api.sendInteractiveReplyButtons(
          waId,
          p['body'] as string,
          (p['buttons'] as Array<{ id: string; title: string }>) ?? [],
          p['footer'] as string | undefined,
          callbackData,
        );

      case NodeType.SEND_LIST:
        return this.api.sendInteractiveList(
          waId,
          p['body'] as string,
          p['buttonTitle'] as string,
          (p['sections'] as InteraktListSection[]) ?? [],
          callbackData,
        );

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

      case NodeType.NPS: {
        const message = p['message'] as string;
        const buttonLabel = (p['buttonLabel'] as string) || 'Rate';
        const length = Math.min((p['length'] as number) ?? 10, 10);
        const startsAt = (p['startsAt'] as number) ?? 0;
        const leftLabel = p['leftLabel'] as string | undefined;
        const rightLabel = p['rightLabel'] as string | undefined;

        const rows = [];
        for (let i = 0; i < length; i++) {
          const value = (startsAt + i).toString();
          const row: { id: string; title: string; description?: string } = {
            id: value,
            title: value,
          };
          if (i === 0 && leftLabel) row.description = leftLabel.slice(0, 72);
          if (i === length - 1 && rightLabel) row.description = rightLabel.slice(0, 72);
          rows.push(row);
        }

        return this.api.sendInteractiveList(
          waId,
          message,
          buttonLabel,
          [{ title: 'Score', rows }],
          callbackData,
        );
      }

      case NodeType.SEND_CARDS: {
        const title = p['title'] as string | undefined;
        const description = p['description'] as string | undefined;
        const buttons = (p['buttons'] as Array<{ id: string; title: string }>) ?? [];

        let body = '';
        if (title) body += `*${title}*\n`;
        if (description) body += description;
        if (!body) body = '―';

        return this.api.sendInteractiveReplyButtons(waId, body, buttons, undefined, callbackData);
      }

      case NodeType.REDIRECT:
        return this.api.sendText(waId, p['url'] as string, callbackData);

      case NodeType.SEND_LOCATION:
      case NodeType.LOCATION_REQUEST:
      case NodeType.SEND_REACTION:
      case NodeType.SEND_CAROUSEL:
        logger.warn(
          { waId, messageType: msg.type },
          'InteraktSender: message type not supported by Interakt public API — skipped',
        );
        return undefined;

      default:
        logger.warn(
          { waId, messageType: msg.type },
          'InteraktSender: unknown message type — skipped',
        );
        return undefined;
    }
  }

  async uploadMedia(
    url: string,
    _type: 'image' | 'video' | 'audio' | 'document' | 'sticker',
  ): Promise<string> {
    logger.debug({ url }, 'InteraktSender: uploadMedia passthrough (URL)');
    return url;
  }
}
