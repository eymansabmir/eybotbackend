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

export interface InteraktSendResult {
  id: string;
  result: boolean;
  message?: string;
}

/**
 * Converts Meta-style template `components` into Interakt template fields.
 * Meta: { type: 'body'|'header'|'button', parameters: [...] }
 * Interakt: headerValues / bodyValues / buttonValues / fileName
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

/**
 * Interakt template language codes are short (e.g. `en`), while flow nodes often
 * store Meta-style locales (`en_US`). Collapse `en_US` / `en-US` → `en`.
 */
export function toInteraktLanguageCode(languageCode: string): string {
  const trimmed = languageCode?.trim();
  if (!trimmed) return languageCode;
  const primary = trimmed.split(/[_-]/)[0];
  return primary || trimmed;
}

/**
 * Map a WhatsApp waId (E.164 digits, optional +) to Interakt recipient fields.
 * Uses fullPhoneNumber so we do not need to guess country vs national split.
 */
export function toInteraktRecipient(waId: string): { fullPhoneNumber: string } {
  const digits = waId.replace(/[^\d]/g, '');
  if (!digits) {
    throw new WhatsAppAPIError(`Interakt: invalid phone number "${waId}"`);
  }
  return { fullPhoneNumber: `+${digits}` };
}

export class InteraktAPIService {
  private readonly messageUrl: string;

  constructor(private readonly config: InteraktConfig) {
    const base = config.apiUrl.replace(/\/+$/, '');
    this.messageUrl = `${base}/public/message/`;
  }

  async sendTemplate(
    waId: string,
    template: InteraktTemplatePayload,
    callbackData?: string,
  ): Promise<string> {
    const recipient = toInteraktRecipient(waId);
    const body: Record<string, unknown> = {
      ...recipient,
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
    const recipient = toInteraktRecipient(waId);
    const body: Record<string, unknown> = {
      ...recipient,
      type: 'Sticker',
      data: { mediaUrl },
    };
    if (callbackData) body['callbackData'] = callbackData;
    return this.call(body, 'Sticker');
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
