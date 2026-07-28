import type { NormalizedInboundMessage } from '../normalizer';

export type InteraktWebhookType =
  | 'message_received'
  | 'message_api_sent'
  | 'message_api_delivered'
  | 'message_api_read'
  | 'message_api_failed'
  | 'message_api_clicked'
  | 'message_campaign_sent'
  | 'message_campaign_delivered'
  | 'message_campaign_read'
  | 'message_campaign_failed'
  | string;

export interface InteraktWebhookCustomer {
  id?: string;
  channel_phone_number?: string;
  phone_number?: string;
  country_code?: string;
  traits?: Record<string, unknown>;
}

export interface InteraktWebhookMessage {
  id: string;
  chat_message_type?: string;
  message_status?: string;
  received_at_utc?: string;
  delivered_at_utc?: string | null;
  seen_at_utc?: string | null;
  campaign_id?: string | null;
  is_template_message?: boolean;
  message_content_type?: string;
  media_url?: string | null;
  /** Plain text for customer messages, or stringified JSON for templates */
  message?: string | null;
  meta_data?: {
    source?: string;
    source_data?: { callback_data?: string };
  };
  click_type?: string;
  button_text?: string;
  button_link?: string;
  button_payload?: unknown;
  click_timestamp?: string;
  channel_failure_reason?: string | null;
  channel_error_code?: string | null;
}

export interface InteraktWebhookPayload {
  version?: string;
  timestamp?: string;
  type?: InteraktWebhookType;
  data?: {
    customer?: InteraktWebhookCustomer;
    message?: InteraktWebhookMessage;
    event?: {
      callbackData?: string;
      click_type?: string;
      button_text?: string;
      button_link?: string;
      click_timestamp?: string;
    };
  };
}

export interface InteraktStatusUpdate {
  messageId: string;
  status: 'delivered' | 'read';
  timestamp: number;
}

const MEDIA_CONTENT_TYPES = new Set([
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'voice',
]);

const DELIVERED_TYPES = new Set([
  'message_api_delivered',
  'message_campaign_delivered',
]);

const READ_TYPES = new Set([
  'message_api_read',
  'message_campaign_read',
]);

/**
 * Maps Interakt webhook payloads into the system's NormalizedInboundMessage /
 * status shapes so the existing inbound pipeline is unchanged.
 */
export class InteraktNormalizer {
  /**
   * @param waBusinessNumber Business line identifier used for session/credential scoping
   *   (typically INTERAKT_WA_BUSINESS_NUMBER or Meta phoneNumberId stored on the credential).
   */
  normalize(
    orgId: string,
    payload: InteraktWebhookPayload,
    waBusinessNumber: string,
  ): NormalizedInboundMessage | null {
    const type = payload.type;
    if (!type || !waBusinessNumber) return null;

    if (type === 'message_received') {
      return this.normalizeCustomerMessage(orgId, payload, waBusinessNumber);
    }

    if (type === 'message_api_clicked') {
      return this.normalizeButtonClick(orgId, payload, waBusinessNumber);
    }

    return null;
  }

  extractStatus(payload: InteraktWebhookPayload): InteraktStatusUpdate | null {
    const type = payload.type;
    const message = payload.data?.message;
    if (!type || !message?.id) return null;

    let status: 'delivered' | 'read' | undefined;
    if (DELIVERED_TYPES.has(type)) status = 'delivered';
    else if (READ_TYPES.has(type)) status = 'read';
    else return null;

    const ts =
      (status === 'read' ? message.seen_at_utc : message.delivered_at_utc) ??
      message.received_at_utc ??
      payload.timestamp;

    return {
      messageId: message.id,
      status,
      timestamp: this.parseTimestamp(ts),
    };
  }

  private normalizeCustomerMessage(
    orgId: string,
    payload: InteraktWebhookPayload,
    waBusinessNumber: string,
  ): NormalizedInboundMessage | null {
    const customer = payload.data?.customer;
    const message = payload.data?.message;
    if (!message?.id) return null;

    const waId = this.resolveWaId(customer);
    if (!waId) return null;

    const contentType = (message.message_content_type ?? 'Text').trim();
    const mappedType = this.mapContentType(contentType);
    const text = this.extractText(message, mappedType, contentType);
    const interactiveOptionId = this.extractInteractiveId(message, contentType);

    const base: NormalizedInboundMessage = {
      orgId,
      messageId: message.id,
      waId,
      waBusinessNumber,
      text: text?.trim() ?? '',
      type: mappedType,
      timestamp: this.parseTimestamp(message.received_at_utc ?? payload.timestamp),
    };

    const contactName = this.extractContactName(customer);
    if (contactName) base.contactName = contactName;
    if (interactiveOptionId) base.interactiveOptionId = interactiveOptionId;

    Object.assign(base, this.extractMedia(message, mappedType));
    Object.assign(base, this.extractLocation(message, contentType));

    return base;
  }

  private normalizeButtonClick(
    orgId: string,
    payload: InteraktWebhookPayload,
    waBusinessNumber: string,
  ): NormalizedInboundMessage | null {
    const customer = payload.data?.customer;
    const message = payload.data?.message;
    const event = payload.data?.event;
    if (!message?.id) return null;

    const waId = this.resolveWaId(customer);
    if (!waId) return null;

    const buttonText =
      message.button_text ??
      event?.button_text ??
      this.extractButtonTextFromPayload(message.button_payload) ??
      '';

    // Synthetic id so the click is not deduped against the original outbound template message id.
    const clickTs = message.click_timestamp ?? event?.click_timestamp ?? payload.timestamp ?? '';
    const messageId = `${message.id}:click:${clickTs || Date.now()}`;

    const base: NormalizedInboundMessage = {
      orgId,
      messageId,
      waId,
      waBusinessNumber,
      text: buttonText,
      type: 'button',
      timestamp: this.parseTimestamp(
        typeof clickTs === 'string' && clickTs ? clickTs : payload.timestamp,
      ),
      interactiveOptionId: buttonText || undefined,
    };

    const contactName = this.extractContactName(customer);
    if (contactName) base.contactName = contactName;
    if (message.id) base.contextMessageId = message.id;

    return base;
  }

  private resolveWaId(customer?: InteraktWebhookCustomer): string | undefined {
    if (customer?.channel_phone_number) {
      return customer.channel_phone_number.replace(/[^\d]/g, '');
    }
    if (customer?.country_code && customer?.phone_number) {
      const cc = customer.country_code.replace(/[^\d]/g, '');
      const national = customer.phone_number.replace(/[^\d]/g, '');
      return `${cc}${national}`;
    }
    return undefined;
  }

  private extractContactName(customer?: InteraktWebhookCustomer): string | undefined {
    const traits = customer?.traits;
    if (!traits) return undefined;
    const name = traits['name'];
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  }

  private mapContentType(contentType: string): string {
    const lower = contentType.toLowerCase();
    if (lower === 'text') return 'text';
    if (MEDIA_CONTENT_TYPES.has(lower)) return lower === 'voice' ? 'audio' : lower;
    if (lower.includes('list')) return 'interactive';
    if (lower.includes('button') || lower.includes('quick')) return 'interactive';
    if (lower === 'location') return 'location';
    if (lower === 'reaction') return 'reaction';
    if (lower === 'contacts' || lower === 'contact') return 'contacts';
    if (lower === 'sticker') return 'sticker';
    return lower || 'text';
  }

  private extractText(
    message: InteraktWebhookMessage,
    mappedType: string,
    contentType: string,
  ): string | null {
    const raw = message.message;

    if (mappedType === 'interactive' || mappedType === 'button') {
      if (typeof raw === 'string' && raw.trim() && !raw.trim().startsWith('[')) {
        return raw;
      }
      return message.button_text ?? raw ?? contentType;
    }

    if (MEDIA_CONTENT_TYPES.has(mappedType)) {
      if (typeof raw === 'string' && raw.trim() && !raw.trim().startsWith('[')) {
        return raw; // caption
      }
      return mappedType;
    }

    if (mappedType === 'location') {
      return 'Location shared';
    }

    if (typeof raw === 'string') {
      // Template-style JSON blobs are not useful as user text.
      if (raw.trim().startsWith('[')) return null;
      return raw;
    }

    return null;
  }

  private extractInteractiveId(
    message: InteraktWebhookMessage,
    contentType: string,
  ): string | undefined {
    const lower = contentType.toLowerCase();
    if (!lower.includes('list') && !lower.includes('button') && !lower.includes('quick')) {
      return undefined;
    }
    const raw = message.message;
    if (typeof raw === 'string' && raw.trim() && !raw.trim().startsWith('[')) {
      return raw.trim();
    }
    return message.button_text;
  }

  private extractMedia(
    message: InteraktWebhookMessage,
    mappedType: string,
  ): Partial<NormalizedInboundMessage> {
    if (!MEDIA_CONTENT_TYPES.has(mappedType) && mappedType !== 'sticker') return {};
    const result: Partial<NormalizedInboundMessage> = {};
    if (message.media_url) {
      result.mediaUrl = message.media_url;
      // Interakt serves public URLs — use URL as mediaId fallback for downstream handlers.
      result.mediaId = message.media_url;
    }
    if (typeof message.message === 'string' && message.message && !message.message.startsWith('[')) {
      result.mediaCaption = message.message;
    }
    return result;
  }

  private extractLocation(
    message: InteraktWebhookMessage,
    contentType: string,
  ): Partial<NormalizedInboundMessage> {
    if (contentType.toLowerCase() !== 'location') return {};
    // Interakt may put coords in message as JSON; best-effort parse.
    try {
      const parsed = typeof message.message === 'string' ? JSON.parse(message.message) : null;
      if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
        const loc: NonNullable<NormalizedInboundMessage['location']> = {
          latitude: parsed.latitude,
          longitude: parsed.longitude,
        };
        if (typeof parsed.name === 'string') loc.name = parsed.name;
        if (typeof parsed.address === 'string') loc.address = parsed.address;
        return { location: loc };
      }
    } catch {
      // ignore
    }
    return {};
  }

  private extractButtonTextFromPayload(buttonPayload: unknown): string | undefined {
    if (!buttonPayload || typeof buttonPayload !== 'object') return undefined;
    const payload = (buttonPayload as { payload?: { text?: string } }).payload;
    return typeof payload?.text === 'string' ? payload.text : undefined;
  }

  private parseTimestamp(value?: string | null): number {
    if (!value) return Date.now();
    // Interakt sometimes sends "2024-06-10 08:38:08.635664" (space instead of T).
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const ms = Date.parse(normalized);
    return Number.isFinite(ms) ? ms : Date.now();
  }
}
