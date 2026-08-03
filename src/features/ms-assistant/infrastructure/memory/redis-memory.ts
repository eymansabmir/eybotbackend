import type { RedisClient } from '../../../../plugins/redis';
import type { MsAssistantConfig } from '../../config';

export interface MemoryTurn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface ConversationMemory {
  summary?: string;
  turns: MemoryTurn[];
  mode?: 'qa' | 'menu';
}

export class RedisConversationMemory {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: MsAssistantConfig,
  ) {}

  private key(waBusinessNumber: string, waId: string): string {
    return `ms:mem:${waBusinessNumber}:${waId}`;
  }

  async get(waBusinessNumber: string, waId: string): Promise<ConversationMemory> {
    const raw = await this.redis.get(this.key(waBusinessNumber, waId));
    if (!raw) return { turns: [], mode: 'menu' };
    try {
      const parsed = JSON.parse(raw) as ConversationMemory;
      return {
        summary: parsed.summary,
        turns: Array.isArray(parsed.turns) ? parsed.turns : [],
        mode: parsed.mode === 'qa' ? 'qa' : 'menu',
      };
    } catch {
      return { turns: [], mode: 'menu' };
    }
  }

  async save(
    waBusinessNumber: string,
    waId: string,
    memory: ConversationMemory,
  ): Promise<void> {
    const trimmed: ConversationMemory = {
      summary: memory.summary,
      mode: memory.mode,
      turns: memory.turns.slice(-this.config.MS_ASSISTANT_MEMORY_MAX_TURNS),
    };
    await this.redis.set(
      this.key(waBusinessNumber, waId),
      JSON.stringify(trimmed),
      'EX',
      this.config.MS_ASSISTANT_MEMORY_TTL_SEC,
    );
  }

  async appendTurn(
    waBusinessNumber: string,
    waId: string,
    turn: MemoryTurn,
    patch?: Partial<Pick<ConversationMemory, 'mode' | 'summary'>>,
  ): Promise<ConversationMemory> {
    const current = await this.get(waBusinessNumber, waId);
    const next: ConversationMemory = {
      summary: patch?.summary ?? current.summary,
      mode: patch?.mode ?? current.mode,
      turns: [...current.turns, turn].slice(-this.config.MS_ASSISTANT_MEMORY_MAX_TURNS),
    };
    await this.save(waBusinessNumber, waId, next);
    return next;
  }

  async setMode(
    waBusinessNumber: string,
    waId: string,
    mode: 'qa' | 'menu',
  ): Promise<void> {
    const current = await this.get(waBusinessNumber, waId);
    await this.save(waBusinessNumber, waId, { ...current, mode });
  }
}
