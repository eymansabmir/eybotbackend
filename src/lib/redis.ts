import Redis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

let redisClient: Redis | null = null;
let bullConnectionOptions: ConnectionOptions | null = null;

function ensureRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL environment variable is required for WhatsApp processing.');
  }
  return url;
}

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = ensureRedisUrl();
  redisClient = new Redis(url);

  redisClient.on('error', (error: Error) => {
    console.error('[Redis] Connection error:', error);
  });

  return redisClient;
}

function parseRedisUrl(urlString: string): ConnectionOptions {
  const url = new URL(urlString);
  const db = url.pathname ? Number(url.pathname.replace('/', '')) : undefined;

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isNaN(db) ? undefined : db,
  };
}

export function getBullConnection(): ConnectionOptions {
  if (bullConnectionOptions) {
    return bullConnectionOptions;
  }

  const url = ensureRedisUrl();
  bullConnectionOptions = parseRedisUrl(url);
  return bullConnectionOptions;
}
