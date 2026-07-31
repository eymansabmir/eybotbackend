import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IWhatsAppPlugin, IWhatsAppSender } from './whatsapp.interface';
import { REDIS_PLUGIN, type IRedisPlugin } from '../redis';
import { WhatsAppNormalizer } from './normalizer';
import { WhatsAppDeduplicator } from './deduplicator';
import { WhatsAppAPIService } from './whatsapp-api.service';
import { createWhatsAppProvider } from './provider.factory';

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
      throw new Error(
        'WhatsAppPlugin: media download requires Meta provider (WHATSAPP_PROVIDER=meta with API credentials)',
      );
    }
    return this._api.getMediaUrl(mediaId);
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    if (!this._api) {
      throw new Error(
        'WhatsAppPlugin: media download requires Meta provider (WHATSAPP_PROVIDER=meta with API credentials)',
      );
    }
    return this._api.downloadMedia(mediaUrl);
  }

  async initialize(registry: IPluginRegistry): Promise<void> {
    const redisPlugin = registry.get<IRedisPlugin>(REDIS_PLUGIN);
    this._normalizer = new WhatsAppNormalizer();
    this._deduplicator = new WhatsAppDeduplicator(redisPlugin.client);

    const bundle = createWhatsAppProvider();
    this._sender = bundle.sender;
    this._api = bundle.metaApi;

    if (bundle.provider === 'meta') {
      logger.info('WhatsAppPlugin: Meta DirectWhatsAppSender ready');
    } else if (bundle.provider === 'interakt') {
      logger.info(
        'WhatsAppPlugin: InteraktSender ready (Text, InteractiveList, Buttons, Media, Sticker, Template)',
      );
    } else {
      logger.warn('WhatsAppPlugin: StubWhatsAppSender ready — no WhatsApp provider configured');
    }
  }

  async shutdown(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }
}
