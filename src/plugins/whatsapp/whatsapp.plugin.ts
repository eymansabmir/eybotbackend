import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IWhatsAppPlugin, IWhatsAppSender } from './whatsapp.interface';
import { REDIS_PLUGIN, type IRedisPlugin } from '../redis';
import { DirectWhatsAppSender, StubWhatsAppSender } from './sender';
import { WhatsAppNormalizer } from './normalizer';
import { WhatsAppDeduplicator } from './deduplicator';
import { WhatsAppAPIService, type WhatsAppConfig } from './whatsapp-api.service';

export class WhatsAppPlugin implements IPlugin, IWhatsAppPlugin {
  readonly name = 'whatsapp';

  private _sender!: IWhatsAppSender;
  private _normalizer!: WhatsAppNormalizer;
  private _deduplicator!: WhatsAppDeduplicator;
  private _api?: WhatsAppAPIService;

  get sender(): IWhatsAppSender {
    return this._sender;
  }

  get normalizer(): WhatsAppNormalizer {
    return this._normalizer;
  }

  get deduplicator(): WhatsAppDeduplicator {
    return this._deduplicator;
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    if (!this._api) {
      throw new Error('WhatsAppPlugin: API client unavailable (WHATSAPP_API_URL/WHATSAPP_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID not configured)');
    }
    return this._api.getMediaUrl(mediaId);
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    if (!this._api) {
      throw new Error('WhatsAppPlugin: API client unavailable (WHATSAPP_API_URL/WHATSAPP_API_TOKEN/WHATSAPP_PHONE_NUMBER_ID not configured)');
    }
    return this._api.downloadMedia(mediaUrl);
  }

  async initialize(registry: IPluginRegistry): Promise<void> {
    const redisPlugin = registry.get<IRedisPlugin>(REDIS_PLUGIN);
    this._normalizer = new WhatsAppNormalizer();
    this._deduplicator = new WhatsAppDeduplicator(redisPlugin.client);

    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (apiUrl && apiToken && phoneNumberId) {
      const config: WhatsAppConfig = { apiUrl, apiToken, phoneNumberId };
      this._api = new WhatsAppAPIService(config);
      this._sender = new DirectWhatsAppSender(this._api);
      logger.info('WhatsAppPlugin: DirectWhatsAppSender ready');
    } else {
      this._sender = new StubWhatsAppSender();
      this._api = undefined;
      logger.warn('WhatsAppPlugin: StubWhatsAppSender ready — WhatsApp API not configured');
    }
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }
}
