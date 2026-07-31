import type { NormalizedInboundMessage } from '../normalizer';

export type InteraktWebhookType =
  | 'message_received'
  | 'message_api_sent'
  | 'message_api_delivered'
  | 'message_api_read'
  | 'message_api_failed'
  | 'message_api_clicked'
  | 'message_api_flow_response'
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
  campaign_name?: string;
  is_template_message?: boolean;
  raw_template?: unknown;
  message_content_type?: string;
  media_url?: string | null;
  /** Plain text, or stringified / object nfm_reply for flow responses */
  message?: string | Record<string, unknown> | null;
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
  source_message_id?: string | null;
  message_context?: {
    from?: string;
    id?: string;
  };
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
    channel_type?: string;
    is_fallback_message?: boolean;
    next_fallback_channel?: unknown;
    source_template_message?: {
      template_name?: string;
      campaign_id?: string | null;
      callback_data?: string;
      status?: string;
      is_campaign?: boolean;
      message_type?: string;
    };
    flow_id?: number | string;
  };
}

export interface InteraktStatusUpdate {
  messageId: string;
  status: 'delivered' | 'read';
  timestamp: number;
}

export interface InteraktFlowResponseExtract {
  providerMessageId: string;
  waId: string;
  interaktFlowId: string;
  templateName?: string;
  callbackData?: string;
  contextMessageId?: string;
  flowToken?: string;
  responseJson: Record<string, unknown>;
  submittedAt: number;
  rawPayload: InteraktWebhookPayload;
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

const FLOW_META_KEYS = new Set(['flow_token']);

/** `Choose all that apply:_(2)` / `choose_all_that_apply_ZHJHcT` → readable label */
function humanizeFlowFieldKey(key: string): string {
  const withoutDup = key.replace(/_\(\d+\)$/, '');
  // Already human: "Choose all that apply:"
  if (/^[A-Z]/.test(withoutDup) && (withoutDup.includes(' ') || withoutDup.includes(':'))) {
    return withoutDup;
  }
  // Meta ids: choose_one_yypRmY / Choose_all_that_apply_0
  const parts = withoutDup.split('_').filter(Boolean);
  // Drop trailing random Meta suffix (short mixed-case token) and trailing numeric index
  while (parts.length > 1) {
    const last = parts[parts.length - 1]!;
    if (/^\d+$/.test(last) || (/^[A-Za-z0-9]+$/.test(last) && last.length >= 4 && /[A-Z]/.test(last) && /[a-z]/.test(last))) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join(' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/**
 * Meta Flow option values:
 * - `0_Buy_it_right_away` → `Buy it right away`
 * - `option_1785127011941_e83glid1g` → keep as-is (opaque id)
 */
function humanizeFlowOptionValue(raw: string): string {
  const indexed = raw.match(/^\d+_(.+)$/);
  if (indexed?.[1]) {
    return indexed[1].replace(/_/g, ' ');
  }
  return raw;
}

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

    // Flow responses are stored separately — never treat as bot inbound.
    if (type === 'message_api_flow_response') return null;
    if (this.isInteractiveFlowReply(payload)) return null;

    if (type === 'message_received') {
      return this.normalizeCustomerMessage(orgId, payload, waBusinessNumber);
    }

    if (type === 'message_api_clicked') {
      return this.normalizeButtonClick(orgId, payload, waBusinessNumber);
    }

    return null;
  }

  /**
   * Extracts Meta WhatsApp Flow (nfm_reply) survey submissions from Interakt.
   * Handles both `message_api_flow_response` and `message_received` + InteractiveFlowReply.
   */
  extractFlowResponse(payload: InteraktWebhookPayload): InteraktFlowResponseExtract | null {
    const message = payload.data?.message;
    if (!message?.id) return null;

    const isFlowEvent =
      payload.type === 'message_api_flow_response' || this.isInteractiveFlowReply(payload);
    if (!isFlowEvent) return null;

    const waId = this.resolveWaId(payload.data?.customer);
    if (!waId) return null;

    const nfm = this.parseNfmReply(message.message);
    if (!nfm) return null;

    const responseJson = nfm.responseJson;
    const flowToken =
      typeof responseJson['flow_token'] === 'string' ? responseJson['flow_token'] : undefined;

    // Interakt often sends message_received (InteractiveFlowReply) first WITHOUT flow_id /
    // template, then message_api_flow_response WITH them. Ignoring the early event avoids
    // orphan surveys (keyed by message_context.id) that steal the providerMessageId via dedupe
    // and leave the real partners_connect survey without the new answers.
    const interaktFlowIdRaw = payload.data?.flow_id;
    const templateName = payload.data?.source_template_message?.template_name?.trim();
    const hasFlowId = interaktFlowIdRaw !== undefined && interaktFlowIdRaw !== null;
    if (!hasFlowId && !templateName) {
      return null;
    }

    const interaktFlowId = hasFlowId ? String(interaktFlowIdRaw) : templateName!;

    return {
      providerMessageId: message.id,
      waId,
      interaktFlowId,
      templateName,
      callbackData: payload.data?.source_template_message?.callback_data,
      contextMessageId: message.message_context?.id,
      flowToken,
      responseJson,
      submittedAt: this.parseTimestamp(message.received_at_utc ?? payload.timestamp),
      rawPayload: payload,
    };
  }

  /** Flatten response_json into answer rows (arrays → one row per option). */
  static expandAnswers(
    responseJson: Record<string, unknown>,
  ): Array<{ questionKey: string; questionLabel: string; valueText: string | null }> {
    const answers: Array<{ questionKey: string; questionLabel: string; valueText: string | null }> =
      [];

    for (const [questionKey, raw] of Object.entries(responseJson)) {
      if (FLOW_META_KEYS.has(questionKey)) continue;
      const questionLabel = humanizeFlowFieldKey(questionKey);

      if (Array.isArray(raw)) {
        for (const item of raw) {
          answers.push({
            questionKey,
            questionLabel,
            valueText: item == null ? null : humanizeFlowOptionValue(String(item)),
          });
        }
        continue;
      }

      if (raw == null) {
        answers.push({ questionKey, questionLabel, valueText: null });
        continue;
      }

      if (typeof raw === 'object') {
        answers.push({ questionKey, questionLabel, valueText: JSON.stringify(raw) });
        continue;
      }

      answers.push({
        questionKey,
        questionLabel,
        valueText: humanizeFlowOptionValue(String(raw)),
      });
    }

    return answers;
  }

  private isInteractiveFlowReply(payload: InteraktWebhookPayload): boolean {
    const contentType = payload.data?.message?.message_content_type?.toLowerCase() ?? '';
    if (contentType.includes('flow')) return true;
    const msg = payload.data?.message?.message;
    if (typeof msg === 'object' && msg && (msg as { type?: string }).type === 'nfm_reply') {
      return true;
    }
    if (typeof msg === 'string' && msg.includes('nfm_reply')) return true;
    return false;
  }

  private parseNfmReply(
    messageField: InteraktWebhookMessage['message'],
  ): { responseJson: Record<string, unknown> } | null {
    let root: unknown = messageField;
    if (typeof messageField === 'string') {
      try {
        root = JSON.parse(messageField);
      } catch {
        return null;
      }
    }
    if (!root || typeof root !== 'object') return null;

    const obj = root as { type?: string; nfm_reply?: { response_json?: unknown } };
    const nfm = obj.nfm_reply;
    if (!nfm) return null;

    let responseJson: unknown = nfm.response_json;
    if (typeof responseJson === 'string') {
      try {
        responseJson = JSON.parse(responseJson);
      } catch {
        return null;
      }
    }
    if (!responseJson || typeof responseJson !== 'object' || Array.isArray(responseJson)) {
      return null;
    }

    return { responseJson: responseJson as Record<string, unknown> };
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
      if (typeof message.button_text === 'string') return message.button_text;
      if (typeof raw === 'string') return raw;
      return contentType;
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
