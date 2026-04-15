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
        return JSON.parse(cached) as RoutingConfigView;
      }
    }

    const config = await this.prisma.routingConfig.findFirst({
      where: {
        id: configId,
        tenantId,
      },
      include: {
        rules: {
          where: { isActive: true },
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (!config) {
      return null;
    }

    const response = {
      id: config.id,
      tenantId: config.tenantId,
      name: config.name,
      rules: config.rules.map((rule) => ({
        id: rule.id,
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
}
