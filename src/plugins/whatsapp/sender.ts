import { NodeType } from '../../schemas/node-types.enum';
import type { OutboundMessage } from '../engine/engine.interface';
import type { IWhatsAppSender } from './whatsapp.interface';
import { WhatsAppAPIService, type WhatsAppConfig } from './whatsapp-api.service';

export class DirectWhatsAppSender implements IWhatsAppSender {
  private readonly api: WhatsAppAPIService;

  constructor(config: WhatsAppConfig) {
    this.api = new WhatsAppAPIService(config);
  }

  async sendMessages(waId: string, messages: OutboundMessage[], _sessionId?: string): Promise<void> {
    for (const msg of messages) {
      try {
        await this.send(waId, msg);
      } catch (err) {
        logger.error({ waId, messageType: msg.type, err }, 'DirectWhatsAppSender: failed to send message');
      }
    }
  }

  private async send(waId: string, msg: OutboundMessage): Promise<void> {
    const p = msg.payload;
    switch (msg.type) {
      case NodeType.SEND_TEXT:
      case NodeType.ASK_QUESTION:
      case NodeType.ASK_FILE:
        return this.api.sendText(waId, p['message'] as string);
      case NodeType.SEND_IMAGE:
        return this.api.sendImage(waId, p['url'] as string, p['caption'] as string | undefined);
      case NodeType.SEND_VIDEO:
        return this.api.sendVideo(waId, p['url'] as string, p['caption'] as string | undefined);
      case NodeType.SEND_AUDIO:
        return this.api.sendAudio(waId, p['url'] as string);
      case NodeType.SEND_DOCUMENT:
        return this.api.sendDocument(waId, p['url'] as string, p['caption'] as string | undefined, p['filename'] as string | undefined);
      case NodeType.SEND_LOCATION:
        return this.api.sendLocation(waId, p['latitude'] as number, p['longitude'] as number, p['name'] as string | undefined, p['address'] as string | undefined);
      case NodeType.SEND_BUTTONS:
        return this.api.sendButtons(waId, p['body'] as string, p['buttons'] as any[], p['footer'] as string | undefined);
      case NodeType.SEND_LIST:
        return this.api.sendList(waId, p['body'] as string, p['buttonTitle'] as string, p['sections'] as any[], p['footer'] as string | undefined);
      case NodeType.SEND_TEMPLATE:
        return this.api.sendTemplate(waId, p['templateName'] as string, p['languageCode'] as string, p['components'] as any[]);
      case NodeType.SEND_STICKER:
        return this.api.sendSticker(waId, (p['mediaId'] as string) || (p['url'] as string));
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
          const row: any = { id: value, title: value };
          if (i === 0 && leftLabel) row.description = leftLabel.slice(0, 72);
          if (i === length - 1 && rightLabel) row.description = rightLabel.slice(0, 72);
          rows.push(row);
        }

        return this.api.sendList(waId, message, buttonLabel, [{ title: 'Score', rows }]);
      }
      case NodeType.SEND_CARDS: {
        const imageUrl = p['imageUrl'] as string | undefined;
        const title = p['title'] as string | undefined;
        const description = p['description'] as string | undefined;
        const buttons = p['buttons'] as any[];

        let body = '';
        if (title) body += `*${title}*\n`;
        if (description) body += description;
        if (!body) body = '―';

        let header;
        if (imageUrl) {
          const isId = !imageUrl.startsWith('http');
          header = {
            type: 'image',
            image: isId ? { id: imageUrl } : { link: imageUrl },
          };
        }

        return this.api.sendButtons(waId, body, buttons, undefined, header);
      }
      case NodeType.SEND_CAROUSEL:
        return this.api.sendCarousel(waId, p['bodyText'] as string | undefined, p['cards'] as any[]);
      default:
        logger.warn({ waId, messageType: msg.type }, 'DirectWhatsAppSender: unknown message type');
    }
  }

  async uploadMedia(url: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker'): Promise<string> {
    return this.api.uploadMedia(url, type);
  }
}

export class StubWhatsAppSender implements IWhatsAppSender {
  async sendMessages(waId: string, messages: OutboundMessage[]): Promise<void> {
    logger.debug({ waId, messages }, 'StubWhatsAppSender: would send message(s)');
  }

  async uploadMedia(_url: string, _type: 'image' | 'video' | 'audio' | 'document' | 'sticker'): Promise<string> {
    logger.debug({ _url, _type }, 'StubWhatsAppSender: would upload media');
    return 'stub-media-id';
  }
}
