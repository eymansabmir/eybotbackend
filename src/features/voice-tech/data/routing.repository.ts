import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { RoutingConditionNode } from '../domain/condition.types';
import type { RoutingAction } from '../domain/rule.types';

const ROUTING_CONFIG_CACHE_TTL_SECONDS = 30;

function routingConfigCacheKey(configId: string, tenantId: string): string {
  return `voice:routing-config:${tenantId}:${configId}`;
}

export interface RoutingRuleView {
  id: string;
  routingConfigId: string;
  priority: number;
  conditions: RoutingConditionNode;
  action: RoutingAction;
}

export interface RoutingConfigView {
  id: string;
  tenantId: string;
  name: string;
  rules: RoutingRuleView[];
}

export interface IVoiceRoutingRepository {
  getRoutingConfig(configId: string, tenantId: string): Promise<RoutingConfigView | null>;
  listConfigs(tenantId: string): Promise<Omit<RoutingConfigView, 'rules'>[]>;
  upsertRule(data: {
    id?: string;
    routingConfigId: string;
    priority: number;
    conditions: RoutingConditionNode;
    action: RoutingAction;
    isActive?: boolean;
  }): Promise<RoutingRuleView>;
  deleteRule(ruleId: string): Promise<void>;
  deleteConfig(id: string, tenantId: string): Promise<void>;
  findConfigByName(name: string, tenantId: string): Promise<string | null>;
  invalidateConfigCache(configId: string, tenantId: string): Promise<void>;
  createConfig(data: { tenantId: string; name: string }): Promise<Omit<RoutingConfigView, 'rules'>>;
  getRuleById(ruleId: string): Promise<RoutingRuleView | null>;
}

export class PrismaVoiceRoutingRepository implements IVoiceRoutingRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis,
  ) {}

  async getRoutingConfig(configId: string, tenantId: string): Promise<RoutingConfigView | null> {
    const cacheKey = routingConfigCacheKey(configId, tenantId);
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        console.log(`[VoiceRouting] Cache HIT for config ${configId}`);
        return JSON.parse(cached) as RoutingConfigView;
      }
    }

    console.log(`[VoiceRouting] Cache MISS for config ${configId}, fetching from DB...`);
    const config = await this.prisma.routingConfig.findFirst({
      where: {
        id: configId,
        tenantId,
      },
      include: {
        rules: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!config) {
      console.log(`[VoiceRouting] Config ${configId} NOT FOUND in DB`);
      return null;
    }

    console.log(`[VoiceRouting] Found ${config.rules.length} rules in DB for config ${configId}`);

    const response = {
      id: config.id,
      tenantId: config.tenantId,
      name: config.name,
      rules: config.rules.map((rule) => ({
        id: rule.id,
        routingConfigId: rule.routingConfigId,
        priority: rule.priority,
        conditions: rule.conditions as unknown as RoutingConditionNode,
        action: rule.action as unknown as RoutingAction,
      })),
    };

    if (this.redis) {
      await this.redis.set(cacheKey, JSON.stringify(response), 'EX', ROUTING_CONFIG_CACHE_TTL_SECONDS);
    }

    return response;
  }

  async listConfigs(tenantId: string): Promise<Omit<RoutingConfigView, 'rules'>[]> {
    const configs = await this.prisma.routingConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
      },
    });

    return configs;
  }

  async upsertRule(data: {
    id?: string;
    routingConfigId: string;
    priority: number;
    conditions: RoutingConditionNode;
    action: RoutingAction;
    isActive?: boolean;
  }): Promise<RoutingRuleView> {
    const rule = await this.prisma.routingRule.upsert({
      where: { id: data.id ?? 'new' },
      create: {
        routingConfigId: data.routingConfigId,
        priority: data.priority,
        conditions: data.conditions as any,
        action: data.action as any,
        isActive: data.isActive ?? true,
      },
      update: {
        priority: data.priority,
        conditions: data.conditions as any,
        action: data.action as any,
        isActive: data.isActive ?? true,
      },
    });

    // Invalidate cache for the parent config
    const config = await this.prisma.routingConfig.findUnique({
      where: { id: data.routingConfigId },
    });
    if (config) {
      await this.invalidateConfigCache(config.id, config.tenantId);
    }

    return {
      id: rule.id,
      routingConfigId: rule.routingConfigId,
      priority: rule.priority,
      conditions: rule.conditions as any,
      action: rule.action as any,
    };
  }

  async deleteRule(ruleId: string): Promise<void> {
    const rule = await this.prisma.routingRule.findUnique({
      where: { id: ruleId },
      include: { routingConfig: true },
    });
    
    if (rule) {
      await this.prisma.routingRule.delete({ where: { id: ruleId } });
      await this.invalidateConfigCache(rule.routingConfig.id, rule.routingConfig.tenantId);
    }
  }

  async deleteConfig(id: string, tenantId: string): Promise<void> {
    const config = await this.prisma.routingConfig.findUnique({
      where: { id, tenantId },
    });

    if (config) {
      // Prisma Cascade handles rules deletion
      await this.prisma.routingConfig.delete({
        where: { id, tenantId },
      });
      await this.invalidateConfigCache(id, tenantId);
    }
  }

  async findConfigByName(name: string, tenantId: string): Promise<string | null> {
    const config = await this.prisma.routingConfig.findFirst({
      where: { name, tenantId },
      select: { id: true },
    });
    return config?.id || null;
  }

  async invalidateConfigCache(configId: string, tenantId: string): Promise<void> {
    if (this.redis) {
      const cacheKey = routingConfigCacheKey(configId, tenantId);
      await this.redis.del(cacheKey);
    }
  }

  async createConfig(data: { tenantId: string; name: string }): Promise<Omit<RoutingConfigView, 'rules'>> {
    const config = await this.prisma.routingConfig.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
      },
    });
    return {
      id: config.id,
      tenantId: config.tenantId,
      name: config.name,
    };
  }
  
  async getRuleById(ruleId: string): Promise<RoutingRuleView | null> {
    const rule = await this.prisma.routingRule.findUnique({
      where: { id: ruleId },
    });
    
    if (!rule) return null;
    
    return {
      id: rule.id,
      routingConfigId: rule.routingConfigId,
      priority: rule.priority,
      conditions: rule.conditions as any,
      action: rule.action as any,
    };
  }
}
