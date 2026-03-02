import { WhatsAppAPIError } from '../utils/errors';

export interface WhatsAppConfig {
  apiUrl: string;
  apiToken: string;
  phoneNumberId: string;
}

export class WhatsAppAPIService {
  private readonly config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
  }

  async sendText(to: string, text: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    };
    await this.callAPI(payload);
  }

  async sendImage(to: string, url: string, caption?: string): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: url },
    };
    if (caption) {
      payload.image.caption = caption;
    }
    await this.callAPI(payload);
  }

  async sendVideo(to: string, url: string, caption?: string): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'video',
      video: { link: url },
    };
    if (caption) {
      payload.video.caption = caption;
    }
    await this.callAPI(payload);
  }

  async sendAudio(to: string, url: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'audio',
      audio: { link: url },
    };
    await this.callAPI(payload);
  }

  async sendDocument(to: string, url: string, caption?: string, filename?: string): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: { link: url },
    };
    if (caption) {
      payload.document.caption = caption;
    }
    if (filename) {
      payload.document.filename = filename;
    }
    await this.callAPI(payload);
  }

  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location: {
        latitude,
        longitude,
      },
    };
    if (name) payload.location.name = name;
    if (address) payload.location.address = address;
    await this.callAPI(payload);
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    footer?: string
  ): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };
    if (footer) {
      payload.interactive.footer = { text: footer };
    }
    await this.callAPI(payload);
  }

  async sendList(
    to: string,
    body: string,
    buttonTitle: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    footer?: string
  ): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: buttonTitle,
          sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description,
            })),
          })),
        },
      },
    };
    if (footer) {
      payload.interactive.footer = { text: footer };
    }
    await this.callAPI(payload);
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: any[]
  ): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };
    if (components) {
      payload.template.components = components;
    }
    await this.callAPI(payload);
  }

  private async callAPI(payload: any): Promise<any> {
    const url = `${this.config.apiUrl}/${this.config.phoneNumberId}/messages`;
    console.log("REACHED API CALL", payload)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log("API RESPONSE", response)
    if (!response.ok) {
      const errorText = await response.text();
      throw new WhatsAppAPIError(
        `WhatsApp API error: ${response.status} - ${errorText}`,
        response.status
      );
    }

    return response.json();
  }
}
