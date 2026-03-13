import type Redis from 'ioredis';

export const REDIS_PLUGIN = 'redis' as const;

export interface IRedisPlugin {
  /** ioredis client — use for direct Redis operations (dedup, locking). */
  readonly client: Redis;
}
