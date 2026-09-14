import type { RedisClient } from '../../../../plugins/redis';
import type { MsAssistantConfig } from '../../config';
import type { HeroLeadState } from '../../application/hero-lead';
import { EMPTY_HERO_LEAD } from '../../application/hero-lead';
import type { AxisLeadState } from '../../application/axis-lead';
import { EMPTY_AXIS_LEAD } from '../../application/axis-lead';
import type { BurgundyDiscoveryState } from '../../application/axis-burgundy';
import { EMPTY_BURGUNDY_DISCOVERY } from '../../application/axis-burgundy';
import type { BurgundyNegotiationState } from '../../application/axis-burgundy';
import { EMPTY_BURGUNDY_NEGOTIATION } from '../../application/axis-burgundy';
import type { ResumeState } from '../../application/resume-builder';
import { EMPTY_RESUME_STATE } from '../../application/resume-builder';

export interface MemoryTurn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface ConversationMemory {
  summary?: string;
  turns: MemoryTurn[];
  mode?: 'qa' | 'menu';
  heroLead?: HeroLeadState;
  axisLead?: AxisLeadState;
  axisNegotiation?: BurgundyNegotiationState;
  axisDiscovery?: BurgundyDiscoveryState;
  resumeState?: ResumeState;
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
    if (!raw) {
      return {
        turns: [],
        mode: 'menu',
        heroLead: EMPTY_HERO_LEAD,
        axisLead: EMPTY_AXIS_LEAD,
        axisNegotiation: EMPTY_BURGUNDY_NEGOTIATION,
        axisDiscovery: EMPTY_BURGUNDY_DISCOVERY,
        resumeState: EMPTY_RESUME_STATE,
      };
    }
    try {
      const parsed = JSON.parse(raw) as ConversationMemory;
      return {
        summary: parsed.summary,
        turns: Array.isArray(parsed.turns) ? parsed.turns : [],
        mode: parsed.mode === 'qa' ? 'qa' : 'menu',
        heroLead: parsed.heroLead ?? EMPTY_HERO_LEAD,
        axisLead: parsed.axisLead ?? EMPTY_AXIS_LEAD,
        axisNegotiation: parsed.axisNegotiation ?? EMPTY_BURGUNDY_NEGOTIATION,
        axisDiscovery: parsed.axisDiscovery ?? EMPTY_BURGUNDY_DISCOVERY,
        resumeState: parsed.resumeState ?? EMPTY_RESUME_STATE,
      };
    } catch {
      return {
        turns: [],
        mode: 'menu',
        heroLead: EMPTY_HERO_LEAD,
        axisLead: EMPTY_AXIS_LEAD,
        axisNegotiation: EMPTY_BURGUNDY_NEGOTIATION,
        axisDiscovery: EMPTY_BURGUNDY_DISCOVERY,
        resumeState: EMPTY_RESUME_STATE,
      };
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
      heroLead: memory.heroLead,
      axisLead: memory.axisLead,
      axisNegotiation: memory.axisNegotiation,
      axisDiscovery: memory.axisDiscovery,
      resumeState: memory.resumeState,
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
      heroLead: current.heroLead,
      axisLead: current.axisLead,
      axisNegotiation: current.axisNegotiation,
      axisDiscovery: current.axisDiscovery,
      resumeState: current.resumeState,
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

  async patchHeroLead(
    waBusinessNumber: string,
    waId: string,
    heroLead: HeroLeadState,
  ): Promise<ConversationMemory> {
    const current = await this.get(waBusinessNumber, waId);
    const next = { ...current, heroLead };
    await this.save(waBusinessNumber, waId, next);
    return next;
  }

  async patchAxisLead(
    waBusinessNumber: string,
    waId: string,
    axisLead: AxisLeadState,
  ): Promise<ConversationMemory> {
    const current = await this.get(waBusinessNumber, waId);
    const next = { ...current, axisLead };
    await this.save(waBusinessNumber, waId, next);
    return next;
  }

  async patchAxisDiscovery(
    waBusinessNumber: string,
    waId: string,
    axisDiscovery: BurgundyDiscoveryState,
  ): Promise<ConversationMemory> {
    const current = await this.get(waBusinessNumber, waId);
    const next = { ...current, axisDiscovery };
    await this.save(waBusinessNumber, waId, next);
    return next;
  }

  async patchAxisNegotiation(
    waBusinessNumber: string,
    waId: string,
    axisNegotiation: BurgundyNegotiationState,
  ): Promise<ConversationMemory> {
    const current = await this.get(waBusinessNumber, waId);
    const next = { ...current, axisNegotiation };
    await this.save(waBusinessNumber, waId, next);
    return next;
  }

  async patchResumeState(
    waBusinessNumber: string,
    waId: string,
    resumeState: ResumeState,
  ): Promise<ConversationMemory> {
    const current = await this.get(waBusinessNumber, waId);
    const next = { ...current, resumeState };
    await this.save(waBusinessNumber, waId, next);
    return next;
  }
}
