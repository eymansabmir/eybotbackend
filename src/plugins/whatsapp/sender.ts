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
        console.error(`[DirectWhatsAppSender] Failed to send ${msg.type}:`, err);
      }
    }
  }

  private async send(waId: string, msg: OutboundMessage): Promise<void> {
    const p = msg.payload;
    switch (msg.type) {
      case NodeType.SEND_TEXT:
      case NodeType.ASK_QUESTION:
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
      default:
        console.warn(`[DirectWhatsAppSender] Unknown message type: ${msg.type}`);
    }
  }
}

export class StubWhatsAppSender implements IWhatsAppSender {
  async sendMessages(waId: string, messages: OutboundMessage[]): Promise<void> {
    console.log('[StubWhatsAppSender] Would send to', waId, ':', JSON.stringify(messages, null, 2));
  }
}
