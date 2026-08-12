import { env } from '../../config/env';
import { isFeatureEnabled } from '../../config/feature-flags';
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

/**
 * Resolve outbound WhatsApp provider.
 *
 * Precedence:
 * 1. WHATSAPP_PROVIDER env (manual override)
 * 2. FEATURE_FLAGS.BSP_PROVIDER_META
 * 3. FEATURE_FLAGS.BSP_PROVIDER_INTERAKT
 * 4. stub
 *
 * Enable only one BSP_* flag at a time. If both are on, Meta wins and a warning is logged.
 */
export function resolveWhatsAppProviderName(): WhatsAppProviderName {
  if (env.WHATSAPP_PROVIDER) {
    return env.WHATSAPP_PROVIDER;
  }

  const metaOn = isFeatureEnabled('BSP_PROVIDER_META');
  const interaktOn = isFeatureEnabled('BSP_PROVIDER_INTERAKT');

  if (metaOn && interaktOn) {
    logger.warn(
      'Both BSP_PROVIDER_META and BSP_PROVIDER_INTERAKT are enabled — using Meta. Enable only one flag.',
    );
  }

  if (metaOn) return 'meta';
  if (interaktOn) return 'interakt';
  return 'stub';
}

export function createWhatsAppProvider(): WhatsAppProviderBundle {
  const provider = resolveWhatsAppProviderName();

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
