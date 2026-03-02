import Redis from 'ioredis';

const DEDUP_PREFIX = 'wa:dedup:';
const DEDUP_TTL_SECONDS = 86400; // 24 hours

export class WhatsAppDeduplicator {
  constructor(private readonly redis: Redis) {}

  async isDuplicate(messageId: string): Promise<boolean> {
    const key = `${DEDUP_PREFIX}${messageId}`;
    const result = await this.redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
    return result === null; // Key already exists
  }

  async markProcessed(messageId: string, ttlSeconds = DEDUP_TTL_SECONDS): Promise<void> {
    const key = `${DEDUP_PREFIX}${messageId}`;
    await this.redis.set(key, '1', 'EX', ttlSeconds);
  }

  async clear(messageId: string): Promise<void> {
    const key = `${DEDUP_PREFIX}${messageId}`;
    await this.redis.del(key);
  }
}
