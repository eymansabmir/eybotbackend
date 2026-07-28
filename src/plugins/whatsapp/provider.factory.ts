import { env } from '../../config/env';
import type { IWhatsAppSender } from './whatsapp.interface';
import { DirectWhatsAppSender, StubWhatsAppSender } from './sender';
import { WhatsAppAPIService } from './whatsapp-api.service';
import { InteraktAPIService } from './interakt/interakt-api.service';
import { InteraktSender } from './interakt/interakt.sender';

export type WhatsAppProviderName = 'meta' | 'interakt' | 'stub';

export interface WhatsAppProviderBundle {
  provider: WhatsAppProviderName;
  sender: IWhatsAppSender;
  /** Meta client — only set when provider is meta */
  metaApi?: WhatsAppAPIService;
  /** Interakt client — only set when provider is interakt */
  interaktApi?: InteraktAPIService;
}

function resolveProviderName(): WhatsAppProviderName {
  if (env.WHATSAPP_PROVIDER) return env.WHATSAPP_PROVIDER;

  // Backward compatible: Meta when fully configured, otherwise stub.
  if (env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    return 'meta';
  }
  if (env.INTERAKT_API_KEY) {
    return 'interakt';
  }
  return 'stub';
}

export function createWhatsAppProvider(): WhatsAppProviderBundle {
  const provider = resolveProviderName();

  if (provider === 'meta') {
    const apiUrl = env.WHATSAPP_API_URL;
    const apiToken = env.WHATSAPP_API_TOKEN;
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    if (!apiUrl || !apiToken || !phoneNumberId) {
      logger.warn(
        'WhatsApp provider=meta but WHATSAPP_API_URL/TOKEN/PHONE_NUMBER_ID incomplete — using stub',
      );
      return { provider: 'stub', sender: new StubWhatsAppSender() };
    }
    const metaApi = new WhatsAppAPIService({ apiUrl, apiToken, phoneNumberId });
    return {
      provider: 'meta',
      sender: new DirectWhatsAppSender(metaApi),
      metaApi,
    };
  }

  if (provider === 'interakt') {
    if (!env.INTERAKT_API_KEY) {
      logger.warn('WhatsApp provider=interakt but INTERAKT_API_KEY missing — using stub');
      return { provider: 'stub', sender: new StubWhatsAppSender() };
    }
    const interaktApi = new InteraktAPIService({
      apiUrl: env.INTERAKT_API_URL,
      apiKey: env.INTERAKT_API_KEY,
      defaultCountryCode: env.INTERAKT_DEFAULT_COUNTRY_CODE,
    });
    return {
      provider: 'interakt',
      sender: new InteraktSender(interaktApi),
      interaktApi,
    };
  }

  return { provider: 'stub', sender: new StubWhatsAppSender() };
}
