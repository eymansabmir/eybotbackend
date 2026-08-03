import type { Cluster, Redis } from 'ioredis';

export const REDIS_PLUGIN = 'redis' as const;

/** Standalone or cluster — both support get/set/del used across the app. */
export type RedisClient = Redis | Cluster;

export interface IRedisPlugin {
  /** ioredis client — use for direct Redis operations (dedup, locking). */
  readonly client: RedisClient;
}
