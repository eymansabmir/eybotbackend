import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IWhatsAppPlugin, IWhatsAppSender } from './whatsapp.interface';
import { REDIS_PLUGIN, type IRedisPlugin } from '../redis';
import { DirectWhatsAppSender, StubWhatsAppSender } from './sender';
import { WhatsAppNormalizer } from './normalizer';
import { WhatsAppDeduplicator } from './deduplicator';
import type { WhatsAppConfig } from './whatsapp-api.service';

export class WhatsAppPlugin implements IPlugin, IWhatsAppPlugin {
  readonly name = 'whatsapp';

  private _sender!: IWhatsAppSender;
  private _normalizer!: WhatsAppNormalizer;
  private _deduplicator!: WhatsAppDeduplicator;
  private _apiConfig?: WhatsAppConfig;

  get sender(): IWhatsAppSender {
    return this._sender;
  }

  get normalizer(): WhatsAppNormalizer {
    return this._normalizer;
  }

  get deduplicator(): WhatsAppDeduplicator {
    return this._deduplicator;
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
      this._apiConfig = config;
      this._sender = new DirectWhatsAppSender(config);
      logger.info('WhatsAppPlugin: DirectWhatsAppSender ready');
    } else {
      this._sender = new StubWhatsAppSender();
      logger.warn('WhatsAppPlugin: StubWhatsAppSender ready — WhatsApp API not configured');
    }
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    if (!this._apiConfig) throw new Error('WhatsApp API not configured');
    const url = `${this._apiConfig.apiUrl}/${mediaId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this._apiConfig.apiToken}` },
    });
    if (!response.ok) {
        throw new Error(`WhatsApp API error: ${response.status}`);
    }
    const data = (await response.json()) as any;
    return data.url;
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    if (!this._apiConfig) throw new Error('WhatsApp API not configured');
    const response = await fetch(mediaUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this._apiConfig.apiToken}` },
    });
    if (!response.ok) {
        throw new Error(`WhatsApp API error: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
