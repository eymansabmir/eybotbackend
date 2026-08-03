import type { RedisClient } from '../redis';

const DEDUP_PREFIX = 'wa:dedup:';
const DEDUP_TTL = 86400; // 24 hours

export class WhatsAppDeduplicator {
  constructor(private readonly redis: RedisClient) {}

  async isDuplicate(messageId: string): Promise<boolean> {
    const result = await this.redis.set(`${DEDUP_PREFIX}${messageId}`, '1', 'EX', DEDUP_TTL, 'NX');
    return result === null;
  }
}
