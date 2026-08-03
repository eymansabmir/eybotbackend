import Redis, { Cluster } from 'ioredis';
import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IRedisPlugin, RedisClient } from './redis.interface';

export class RedisPlugin implements IPlugin, IRedisPlugin {
  readonly name = 'redis';

  private _client!: RedisClient;

  get client(): RedisClient {
    return this._client;
  }

  async initialize(_registry: IPluginRegistry): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('[RedisPlugin] REDIS_URL environment variable is required');
    }

    const clusterMode = isRedisClusterEnabled();
    this._client = clusterMode ? createClusterClient(url) : createStandaloneClient(url);

    this._client.on('error', (err: Error) => {
      logger.error({ err }, 'RedisPlugin: connection error');
    });
    this._client.on('connect', () => {
      logger.info(
        { clusterMode },
        'RedisPlugin: Redis client connected',
      );
    });

    logger.info(
      { clusterMode },
      'RedisPlugin: Redis client ready',
    );
  }

  async shutdown(): Promise<void> {
    await this._client.quit();
    logger.info('RedisPlugin: Redis disconnected');
  }
}

function isRedisClusterEnabled(): boolean {
  const flag = (process.env.REDIS_CLUSTER ?? '').trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'yes';
}

function createStandaloneClient(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

/**
 * Azure Cache for Redis (OSS cluster / Enterprise) returns MOVED redirects.
 * Standalone ioredis cannot follow them — use Cluster mode.
 */
function createClusterClient(url: string): Cluster {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = Number(parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379));
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : undefined;
  const username = parsed.username
    ? decodeURIComponent(parsed.username)
    : undefined;
  const useTls = parsed.protocol === 'rediss:';

  return new Redis.Cluster(
    [{ host, port }],
    {
      redisOptions: {
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
        maxRetriesPerRequest: null,
        ...(useTls ? { tls: {} } : {}),
      },
      // Azure often needs this so CLUSTER SLOTS hostnames resolve correctly
      dnsLookup: (address, callback) => callback(null, address),
      slotsRefreshTimeout: 10_000,
      enableReadyCheck: true,
      scaleReads: 'master',
    },
  );
}
