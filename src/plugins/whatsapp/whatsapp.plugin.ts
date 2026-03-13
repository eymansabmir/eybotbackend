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
      this._sender = new DirectWhatsAppSender(config);
      console.log('[WhatsAppPlugin] DirectWhatsAppSender ready');
    } else {
      this._sender = new StubWhatsAppSender();
      console.log('[WhatsAppPlugin] StubWhatsAppSender ready (API not configured)');
    }
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }
}
