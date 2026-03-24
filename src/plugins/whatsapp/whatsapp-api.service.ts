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

  async sendSticker(to: string, url: string): Promise<void> {
    await this.call({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'sticker', sticker: { link: url } });
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
    await this.call(payload);
  }

  async sendCarousel(to: string, bodyText: string | undefined, cards: any[]): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: bodyText || 'Choose an option below:' },
        action: {
          cards: cards.map((card, index) => ({
            card_index: index,
            type: 'cta_url',
            header: {
              type: card.headerType,
              [card.headerType]: { link: card.url },
            },
            body: card.bodyText ? { text: card.bodyText.slice(0, 160) } : undefined,
            action: card.buttonType === 'cta_url'
              ? {
                  name: 'cta_url',
                  parameters: {
                    display_text: card.ctaUrlButton.displayText?.slice(0, 20) || 'Visit',
                    url: card.ctaUrlButton.url,
                  },
                }
              : {
                  buttons: (card.quickReplyButtons || []).slice(0, 2).map((btn: any) => ({
                    type: 'quick_reply',
                    quick_reply: {
                      id: btn.id,
                      title: btn.title.slice(0, 20),
                    },
                  })),
                },
          })),
        },
      },
    };
    await this.call(payload);
  }

  async sendTemplate(to: string, templateName: string, languageCode: string, components?: unknown[]): Promise<void> {
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: templateName, language: { code: languageCode } },
    };
    if (components) payload.template.components = components;
    await this.call(payload);
  }

  async sendSticker(to: string, sticker: string): Promise<void> {
    const isId = !sticker.startsWith('http');
    await this.call({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'sticker',
      sticker: isId ? { id: sticker } : { link: sticker },
    });
  }

  async uploadMedia(url: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker'): Promise<string> {
    // Note: A full implementation would fetch from `url` and send as multipart to Meta
    logger.info({ url, type }, 'WhatsAppAPI: uploadMedia called (placeholder)');
    return 'placeholder-media-id';
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

  async getMediaUrl(mediaId: string): Promise<string> {
    const url = `${this.config.apiUrl}/${mediaId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.apiToken}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new WhatsAppAPIError(`WhatsApp API media URL error: ${response.status} - ${errorText}`, response.status);
    }
    const data = (await response.json()) as any;
    return data.url;
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const response = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.apiToken}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new WhatsAppAPIError(`WhatsApp API media download error: ${response.status} - ${errorText}`, response.status);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
