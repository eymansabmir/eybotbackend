import { WhatsAppAPIError } from '../../../shared/errors';

export interface InteraktConfig {
  apiUrl: string;
  apiKey: string;
  defaultCountryCode: string;
}

export interface InteraktTemplatePayload {
  name: string;
  languageCode: string;
  headerValues?: string[];
  bodyValues?: string[];
  buttonValues?: Record<string, string[]>;
  fileName?: string;
}

export interface InteraktListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export interface InteraktReplyButton {
  id: string;
  title: string;
}

export interface InteraktSendResult {
  id: string;
  result: boolean;
  message?: string;
}

/**
 * Converts Meta-style template `components` into Interakt template fields.
<<<<<<< HEAD
=======
 * Meta: { type: 'body'|'header'|'button', parameters: [...] }
 * Interakt: headerValues / bodyValues / buttonValues / fileName
>>>>>>> d7ad7c736b71a885da4bec991fa33a3028176d19
 */
export function mapMetaComponentsToInterakt(components?: unknown[]): {
  headerValues?: string[];
  bodyValues?: string[];
  buttonValues?: Record<string, string[]>;
  fileName?: string;
} {
  if (!components?.length) return {};

  const headerValues: string[] = [];
  const bodyValues: string[] = [];
  const buttonValues: Record<string, string[]> = {};
  let fileName: string | undefined;

  for (const raw of components) {
    const comp = raw as {
      type?: string;
      index?: number;
      parameters?: Array<Record<string, unknown>>;
    };
    if (!comp?.type || !Array.isArray(comp.parameters)) continue;

    if (comp.type === 'header') {
      for (const param of comp.parameters) {
        const value = extractParameterValue(param);
        if (value !== undefined) headerValues.push(value);
        const doc = param['document'] as { filename?: string } | undefined;
        if (doc?.filename) fileName = doc.filename;
      }
    } else if (comp.type === 'body') {
      for (const param of comp.parameters) {
        const value = extractParameterValue(param);
        if (value !== undefined) bodyValues.push(value);
      }
    } else if (comp.type === 'button') {
      const index = String(comp.index ?? 0);
      const values: string[] = [];
      for (const param of comp.parameters) {
        if (typeof param['text'] === 'string') values.push(param['text']);
        else if (typeof param['payload'] === 'string') values.push(param['payload']);
        else if (typeof param['coupon_code'] === 'string') values.push(param['coupon_code']);
      }
      if (values.length > 0) buttonValues[index] = values;
    }
  }

  return {
    ...(headerValues.length ? { headerValues } : {}),
    ...(bodyValues.length ? { bodyValues } : {}),
    ...(Object.keys(buttonValues).length ? { buttonValues } : {}),
    ...(fileName ? { fileName } : {}),
  };
}

function extractParameterValue(param: Record<string, unknown>): string | undefined {
  if (typeof param['text'] === 'string') return param['text'];

  const image = param['image'] as { link?: string } | undefined;
  if (image?.link) return image.link;

  const video = param['video'] as { link?: string } | undefined;
  if (video?.link) return video.link;

  const document = param['document'] as { link?: string } | undefined;
  if (document?.link) return document.link;

  const currency = param['currency'] as { fallback_value?: string } | undefined;
  if (currency?.fallback_value) return currency.fallback_value;

  const dateTime = param['date_time'] as { fallback_value?: string } | undefined;
  if (dateTime?.fallback_value) return dateTime.fallback_value;

  return undefined;
}

/** Interakt language codes are short (`en`); collapse `en_US` / `en-US` → `en`. */
export function toInteraktLanguageCode(languageCode: string): string {
  const trimmed = languageCode?.trim();
  if (!trimmed) return languageCode;
  const primary = trimmed.split(/[_-]/)[0];
  return primary || trimmed;
}

/**
 * Prefer countryCode + phoneNumber (matches Interakt docs examples).
 * Falls back to fullPhoneNumber when national number cannot be split.
 */
export function toInteraktRecipient(
  waId: string,
  defaultCountryCode = '+91',
): { countryCode: string; phoneNumber: string } | { fullPhoneNumber: string } {
  const digits = waId.replace(/[^\d]/g, '');
  if (!digits) {
    throw new WhatsAppAPIError(`Interakt: invalid phone number "${waId}"`);
  }

  const ccDigits = defaultCountryCode.replace(/[^\d]/g, '');
  const countryCode = defaultCountryCode.startsWith('+')
    ? `+${ccDigits}`
    : `+${ccDigits || defaultCountryCode}`;

  if (ccDigits && digits.startsWith(ccDigits) && digits.length > ccDigits.length) {
    return { countryCode, phoneNumber: digits.slice(ccDigits.length) };
  }

  return { fullPhoneNumber: `+${digits}` };
}

export class InteraktAPIService {
  private readonly messageUrl: string;

  constructor(private readonly config: InteraktConfig) {
    const base = config.apiUrl.replace(/\/+$/, '');
    this.messageUrl = `${base}/public/message/`;
  }

  private recipient(waId: string) {
    return toInteraktRecipient(waId, this.config.defaultCountryCode);
  }

  async sendText(waId: string, message: string, callbackData?: string): Promise<string> {
    const body: Record<string, unknown> = {
      ...this.recipient(waId),
      type: 'Text',
      data: { message: message || '...' },
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, 'Text');
  }

  async sendInteractiveList(
    waId: string,
    bodyText: string,
    buttonTitle: string,
    sections: InteraktListSection[],
    callbackData?: string,
  ): Promise<string> {
    const normalizedSections = this.normalizeListSections(sections);
    const body: Record<string, unknown> = {
      ...this.recipient(waId),
      type: 'InteractiveList',
      data: {
        message: {
          type: 'list',
          body: { text: bodyText || 'Please select an option:' },
          action: {
            button: this.sliceGraphemes(buttonTitle || 'Options', 20),
            sections: normalizedSections,
          },
        },
      },
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, 'InteractiveList');
  }

  async sendInteractiveReplyButtons(
    waId: string,
    bodyText: string,
    buttons: InteraktReplyButton[],
    footer?: string,
    callbackData?: string,
  ): Promise<string> {
    const message: Record<string, unknown> = {
      type: 'button',
      body: { text: bodyText || 'Please choose an option:' },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: {
            id: this.sliceGraphemes(String(b.id).trim() || 'option', 200),
            title: this.sliceGraphemes(String(b.title).trim() || 'Option', 20),
          },
        })),
      },
    };
    if (footer) {
      message['footer'] = { text: this.sliceGraphemes(footer, 60) };
    }

    const body: Record<string, unknown> = {
      ...this.recipient(waId),
      type: 'InteractiveReplyButton',
      data: { message },
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, 'InteractiveReplyButton');
  }

  async sendMedia(
    waId: string,
    type: 'Image' | 'Video' | 'Audio' | 'Document',
    mediaUrl: string,
    caption?: string,
    filename?: string,
    callbackData?: string,
  ): Promise<string> {
    if (!mediaUrl.startsWith('http')) {
      throw new WhatsAppAPIError(`Interakt ${type} send requires a public mediaUrl`);
    }
    const data: Record<string, unknown> = { mediaUrl };
    if (caption) data['message'] = caption;
    if (filename && type === 'Document') data['fileName'] = filename;

    const body: Record<string, unknown> = {
      ...this.recipient(waId),
      type,
      data,
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, type);
  }

  async sendTemplate(
    waId: string,
    template: InteraktTemplatePayload,
    callbackData?: string,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      ...this.recipient(waId),
      type: 'Template',
      template: {
        name: template.name,
        languageCode: toInteraktLanguageCode(template.languageCode),
        ...(template.headerValues?.length ? { headerValues: template.headerValues } : {}),
        ...(template.bodyValues?.length ? { bodyValues: template.bodyValues } : {}),
        ...(template.buttonValues && Object.keys(template.buttonValues).length
          ? { buttonValues: template.buttonValues }
          : {}),
        ...(template.fileName ? { fileName: template.fileName } : {}),
      },
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, 'Template');
  }

  async sendSticker(waId: string, mediaUrl: string, callbackData?: string): Promise<string> {
    if (!mediaUrl.startsWith('http')) {
      throw new WhatsAppAPIError(
        'Interakt sticker send requires a public mediaUrl (Meta media ids are not supported)',
      );
    }
    const body: Record<string, unknown> = {
      ...this.recipient(waId),
      type: 'Sticker',
      data: { mediaUrl },
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, 'Sticker');
  }

  private normalizeListSections(sections: InteraktListSection[]): InteraktListSection[] {
    const MAX_ROWS_TOTAL = 10;
    const normalized: InteraktListSection[] = [];
    let usedRows = 0;

    for (const section of sections ?? []) {
      if (usedRows >= MAX_ROWS_TOTAL) break;

      const rows = (section?.rows ?? [])
        .filter((row) => typeof row?.id === 'string' && row.id.trim().length > 0)
        .map((row) => ({
          id: this.sliceGraphemes(String(row.id).trim(), 200),
          title: this.sliceGraphemes(String(row.title ?? '').trim() || 'Option', 24),
          description: row.description
            ? this.sliceGraphemes(String(row.description).trim(), 72)
            : undefined,
        }));

      const limitedRows = rows.slice(0, MAX_ROWS_TOTAL - usedRows);
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
    const trimmed = text.trim();
    if (trimmed.length <= limit) return trimmed;

    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      let result = '';
      for (const { segment } of segmenter.segment(trimmed)) {
        if ((result + segment).length > limit) break;
        result += segment;
      }
      return result;
    } catch {
      return trimmed.slice(0, limit);
    }
  }

  private async call(payload: Record<string, unknown>, messageType: string): Promise<string> {
    const to =
      (payload['fullPhoneNumber'] as string | undefined) ??
      `${payload['countryCode'] ?? ''}${payload['phoneNumber'] ?? ''}`;

    logger.info({ messageType, to }, 'InteraktAPI: sending message');
    logger.debug({ payload }, 'InteraktAPI: full payload');

    const response = await fetch(this.messageUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new WhatsAppAPIError(
        `Interakt API error: ${response.status} - ${errorText}`,
        response.status,
      );
    }

    const data = (await response.json()) as InteraktSendResult;
    const messageId = data.id ?? '';

    logger.info(
      { messageType, to, messageId, result: data.result },
      'InteraktAPI: message queued successfully',
    );

    return messageId;
  }
}
