import Redis from 'ioredis';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IRedisPlugin } from './redis.interface';

export class RedisPlugin implements IPlugin, IRedisPlugin {
  readonly name = 'redis';

  private _client!: Redis;

  get client(): Redis {
    return this._client;
  }

  async initialize(_registry: IPluginRegistry): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('[RedisPlugin] REDIS_URL environment variable is required');
    }

    this._client = new Redis(url, { maxRetriesPerRequest: null });
    this._client.on('error', (err: Error) => {
      console.error('[RedisPlugin] Connection error:', err);
    });

    console.log('[RedisPlugin] Redis client ready');
  }

  async shutdown(): Promise<void> {
    await this._client.quit();
    console.log('[RedisPlugin] Redis disconnected');
  }
}
