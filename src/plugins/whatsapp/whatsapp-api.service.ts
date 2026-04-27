import { WhatsAppAPIError } from '../../shared/errors';

export interface WhatsAppConfig {
  apiUrl: string;
  apiToken: string;
  phoneNumberId: string;
}

export class WhatsAppAPIService {
  constructor(private readonly config: WhatsAppConfig) { }

  async sendText(to: string, text: string): Promise<string> {
    return this.call({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text || '...' } });
  }

  async sendImage(to: string, url: string, caption?: string): Promise<string> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'image', image: { link: url } };
    if (caption) payload.image.caption = caption;
    return this.call(payload);
  }

  async sendVideo(to: string, url: string, caption?: string): Promise<string> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'video', video: { link: url } };
    if (caption) payload.video.caption = caption;
    return this.call(payload);
  }

  async sendAudio(to: string, url: string): Promise<string> {
    return this.call({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'audio', audio: { link: url } });
  }

  async sendDocument(to: string, url: string, caption?: string, filename?: string): Promise<string> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'document', document: { link: url } };
    if (caption) payload.document.caption = caption;
    if (filename) payload.document.filename = filename;
    return this.call(payload);
  }

  async sendLocation(to: string, latitude: number, longitude: number, name?: string, address?: string): Promise<string> {
    const payload: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'location', location: { latitude, longitude } };
    if (name) payload.location.name = name;
    if (address) payload.location.address = address;
    return this.call(payload);
  }

  async sendLocationRequest(to: string, body: string): Promise<string> {
    return this.call({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: body || 'Please share your location' },
        action: { name: 'send_location' },
      },
    });
  }

  async sendButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string, header?: any): Promise<string> {
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body || 'Please choose an option:' },
        action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: this.sliceGraphemes(b.title, 20) } })) }
      },
    };
    if (header?.type === 'text' && header.text) header.text = String(header.text).trim().slice(0, 60);
    if (header) payload.interactive.header = header;
    if (footer) payload.interactive.footer = { text: String(footer).trim().slice(0, 60) };
    return this.call(payload);
  }

  async sendList(
    to: string, body: string, buttonTitle: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    footer?: string,
  ): Promise<string> {
    const normalizedSections = this.normalizeListSections(sections);
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
      interactive: {
        type: 'list', body: { text: body || 'Please select an option:' },
        action: { button: this.sliceGraphemes(buttonTitle || 'Options', 20), sections: normalizedSections },
      },
    };
    if (footer) payload.interactive.footer = { text: footer };
    return this.call(payload);
  }

  private normalizeListSections(
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  ): Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> {
    const MAX_ROWS_TOTAL = 10;
    const normalized: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> = [];
    let usedRows = 0;

    for (const section of sections ?? []) {
      if (usedRows >= MAX_ROWS_TOTAL) break;

      const rows = (section?.rows ?? [])
        .filter((row) => typeof row?.id === 'string' && row.id.trim().length > 0)
        .map((row) => ({
          id: this.sliceGraphemes(String(row.id).trim(), 200),
          title: this.sliceGraphemes(String(row.title ?? '').trim() || 'Option', 24),
          description: row.description ? this.sliceGraphemes(String(row.description).trim(), 72) : undefined,
        }));

      const remaining = MAX_ROWS_TOTAL - usedRows;
      const limitedRows = rows.slice(0, remaining);
      if (limitedRows.length === 0) continue;

      normalized.push({
        title: this.sliceGraphemes(String(section?.title ?? '').trim() || 'Options', 24),
        rows: limitedRows,
      });

      usedRows += limitedRows.length;
    }

    if (normalized.length === 0) {
      return [{ title: 'Options', rows: [{ id: 'default_option', title: 'Continue' }] }];
    }

    return normalized;
  }

  private sliceGraphemes(text: string, limit: number): string {
    if (!text) return '';
    try {
      // Use Intl.Segmenter for grapheme-aware slicing (Node 16+)
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const segments = Array.from(segmenter.segment(text.trim()));
      return segments.slice(0, limit).map(s => s.segment).join('');
    } catch (e) {
      // Fallback for environments where Intl.Segmenter is missing
      return text.trim().slice(0, limit);
    }
  }

  async sendCarousel(to: string, bodyText: string | undefined, cards: any[]): Promise<string> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: bodyText || 'Choose an option below:' },
        action: {
          cards: cards.map((card, index) => {
            const dt = this.sliceGraphemes(card.ctaUrlButton?.displayText || 'Visit', 10);
            logger.info(
              { index, buttonType: card.buttonType, displayText: dt, dtLength: dt.length, original: card.ctaUrlButton?.displayText },
              'WhatsAppAPI: carousel card button check'
            );

            return {
              card_index: index,
              type: 'cta_url',
              header: {
                type: card.headerType,
                [card.headerType]: { link: card.url },
              },
              body: card.bodyText ? { text: this.sliceGraphemes(card.bodyText, 160) } : undefined,
              action: card.buttonType === 'cta_url'
                ? {
                  name: 'cta_url',
                  parameters: {
                    display_text: dt,
                    url: card.ctaUrlButton.url || 'https://google.com',
                  },
                }
                : {
                  buttons: (card.quickReplyButtons || []).slice(0, 2).map((btn: any) => ({
                    type: 'quick_reply',
                    quick_reply: {
                      id: btn.id,
                      title: this.sliceGraphemes(btn.title, 20),
                    },
                  })),
                },
            };
          }),
        },
      },
    };
    return this.call(payload);
  }

  async sendTemplate(to: string, templateName: string, languageCode: string, components?: unknown[]): Promise<string> {
    const payload: any = {
      messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template',
      template: { name: templateName, language: { code: languageCode } },
    };
    if (components) payload.template.components = components;
    return this.call(payload);
  }

  async sendSticker(to: string, sticker: string): Promise<string> {
    const isId = !sticker.startsWith('http');
    return this.call({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'sticker',
      sticker: isId ? { id: sticker } : { link: sticker },
    });
  }
  async uploadMedia(url: string, type: string): Promise<string> {
    logger.info({ url, type }, 'WhatsAppAPI: uploading media to Meta');

    try {
      // 1. Download the media from the URL
      const downloadResponse = await fetch(url);
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download media for upload: ${downloadResponse.statusText}`);
      }

      const blob = await downloadResponse.blob();
      const mimeType = blob.type || 'application/octet-stream';

      // 2. Prepare FormData for Meta API
      const formData = new FormData();
      formData.append('file', blob, `media.${mimeType.split('/')[1] || 'bin'}`);
      formData.append('type', type);
      formData.append('messaging_product', 'whatsapp');

      // 3. Upload to Meta
      const uploadUrl = `${this.config.apiUrl}/${this.config.phoneNumberId}/media`;
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiToken}` },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Meta media upload failed: ${uploadResponse.status} - ${errText}`);
      }

      const data = await uploadResponse.json() as { id: string };
      logger.info({ mediaId: data.id }, 'WhatsAppAPI: media uploaded successfully');
      return data.id;
    } catch (err) {
      logger.error({ err, url }, 'WhatsAppAPI: failed to upload media, falling back to URL');
      return url; // Fallback to URL if upload fails
    }
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<string> {
    return this.call({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    });
  }

  private async call(payload: any): Promise<string> {
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

    const data = await response.json() as { messages?: Array<{ id: string }> };
    const messageId = data.messages?.[0]?.id ?? '';

    logger.info(
      { messageType: msgType, to: payload.to, messageId },
      'WhatsAppAPI: message sent to Meta successfully',
    );

    return messageId;
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
    const data = (await response.json()) as { url?: string };
    if (!data.url) {
      throw new WhatsAppAPIError('WhatsApp media metadata did not contain a media URL', 502);
    }
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
