import { WhatsAppAPIService, WhatsAppConfig } from '../whatsapp/whatsapp-api.service';
import { NodeType } from '../schemas/node-types.enum';
import type { OutboundMessage } from '../chat-session/types';

export interface IWhatsAppSender {
  sendMessages(
    waId: string,
    messages: OutboundMessage[],
    sessionId?: string
  ): Promise<void>;
}

export class DirectWhatsAppSender implements IWhatsAppSender {
  private readonly apiService: WhatsAppAPIService;

  constructor(config: WhatsAppConfig) {
    this.apiService = new WhatsAppAPIService(config);
  }

  async sendMessages(
    waId: string,
    messages: OutboundMessage[],
    _sessionId?: string
  ): Promise<void> {
    for (const msg of messages) {
      try {
        await this.sendSingleMessage(waId, msg);
      } catch (error) {
        console.error(`[DirectWhatsAppSender] Failed to send ${msg.type}:`, error);
        // Continue with next message even if one fails
      }
    }
  }

  private async sendSingleMessage(waId: string, msg: OutboundMessage): Promise<void> {
    const { type, payload } = msg;

    switch (type) {
      case NodeType.SEND_TEXT:
      case NodeType.ASK_QUESTION:
        await this.apiService.sendText(waId, payload.message);
        break;

      case NodeType.SEND_IMAGE:
        await this.apiService.sendImage(waId, payload.url, payload.caption);
        break;

      case NodeType.SEND_VIDEO:
        await this.apiService.sendVideo(waId, payload.url, payload.caption);
        break;

      case NodeType.SEND_AUDIO:
        await this.apiService.sendAudio(waId, payload.url);
        break;

      case NodeType.SEND_DOCUMENT:
        await this.apiService.sendDocument(waId, payload.url, payload.caption, payload.filename);
        break;

      case NodeType.SEND_LOCATION:
        await this.apiService.sendLocation(
          waId,
          payload.latitude,
          payload.longitude,
          payload.name,
          payload.address
        );
        break;

      case NodeType.SEND_BUTTONS:
        await this.apiService.sendButtons(waId, payload.body, payload.buttons, payload.footer);
        break;

      case NodeType.SEND_LIST:
        await this.apiService.sendList(
          waId,
          payload.body,
          payload.buttonTitle,
          payload.sections,
          payload.footer
        );
        break;

      case NodeType.SEND_TEMPLATE:
        await this.apiService.sendTemplate(
          waId,
          payload.templateName,
          payload.languageCode,
          payload.components
        );
        break;

      default:
        console.warn(`[DirectWhatsAppSender] Unknown message type: ${type}`);
    }
  }
}

// Stub implementation for when WhatsApp is not configured
export class StubWhatsAppSender implements IWhatsAppSender {
  async sendMessages(
    waId: string,
    messages: OutboundMessage[],
    // sessionId?: string
  ): Promise<void> {
    console.log('[StubWhatsAppSender] Would send to', waId, ':', messages);
  }
}
