import { WhatsAppAPIError } from '../../shared/errors';

export interface WhatsAppConfig {
  apiUrl: string;
  apiToken: string;
  phoneNumberId: string;
}

export class WhatsAppAPIService {
  constructor(private readonly config: WhatsAppConfig) {}

  async sendText(to: string, text: string): Promise<void> {
    await this.call({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text } });
  }

  async sendImage(to: string, url: string, caption?: string): Promise<void> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'image', image: { link: url } };
    if (caption) payload.image.caption = caption;
    await this.call(payload);
  }

  async sendVideo(to: string, url: string, caption?: string): Promise<void> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'video', video: { link: url } };
    if (caption) payload.video.caption = caption;
    await this.call(payload);
  }

  async sendAudio(to: string, url: string): Promise<void> {
    await this.call({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'audio', audio: { link: url } });
  }

  async sendDocument(to: string, url: string, caption?: string, filename?: string): Promise<void> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'document', document: { link: url } };
    if (caption) payload.document.caption = caption;
    if (filename) payload.document.filename = filename;
    await this.call(payload);
  }

  async sendLocation(to: string, latitude: number, longitude: number, name?: string, address?: string): Promise<void> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'location', location: { latitude, longitude } };
    if (name) payload.location.name = name;
    if (address) payload.location.address = address;
    await this.call(payload);
  }

  async sendButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string, header?: any): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) }
      },
    };
    if (header) payload.interactive.header = header;
    if (footer) payload.interactive.footer = { text: footer };
    await this.call(payload);
  }

  async sendList(
    to: string, body: string, buttonTitle: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    footer?: string,
  ): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
      interactive: {
        type: 'list', body: { text: body },
        action: { button: buttonTitle, sections: sections.map(s => ({ title: s.title, rows: s.rows.map(r => ({ id: r.id, title: r.title, description: r.description })) })) },
      },
    };
    if (footer) payload.interactive.footer = { text: footer };
    await this.call(payload);  }

  async sendTemplate(to: string, templateName: string, languageCode: string, components?: unknown[]): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: templateName, language: { code: languageCode } },
    };
    if (components) payload.template.components = components;
    await this.call(payload);
  }

  private async call(payload: any): Promise<void> {
    const msgType = payload.type;
    logger.info(
      { messageType: msgType, to: payload.to },
      'WhatsAppAPI: sending message to Meta',
    );
    logger.debug({ payload }, 'WhatsAppAPI: full payload');

    const url = `${this.config.apiUrl}/${this.config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new WhatsAppAPIError(`WhatsApp API error: ${response.status} - ${errorText}`, response.status);
    }

    logger.info(
      { messageType: msgType, to: payload.to },
      'WhatsAppAPI: message sent to Meta successfully',
    );
  }
}
