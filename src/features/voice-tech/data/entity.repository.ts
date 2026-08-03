import type { PrismaClient } from '@prisma/client';
import type { RedisClient } from '../../../plugins/redis';
import crypto from 'crypto';
import { logger } from '../../../utils/logger';

const ATTRIBUTE_CACHE_TTL_SECONDS = 60;
const ENTITY_TYPE_ID_CACHE_TTL_SECONDS = 60;

function attributeCacheKey(tenantId: string, entityType: string): string {
  return `voice:attributes:${tenantId}:${entityType}`;
}

function entityTypeIdCacheKey(tenantId: string, entityType: string): string {
  return `voice:entity-type:${tenantId}:${entityType}`;
}

export interface EntityAttributeView {
  key: string;
  type: string;
  operators: unknown;
  values: unknown;
}

export interface IEntityRepository {
  ensureEntityType(tenantId: string, entityType: string): Promise<{ id: string; name: string }>;
  upsertAttribute(args: {
    tenantId: string;
    entityTypeId: string;
    key: string;
    type: string;
    operators: unknown;
    values: unknown;
  }): Promise<void>;
  createManyEntities(args: {
    tenantId: string;
    entityTypeId: string;
    records: Record<string, unknown>[];
  }): Promise<void>;
  listEntityTypes(tenantId: string): Promise<{ id: string; name: string }[]>;
  listAttributes(tenantId: string, entityType: string): Promise<EntityAttributeView[]>;
  findEntityTypeId(tenantId: string, entityType: string): Promise<string | null>;
  invalidateEntityTypeCache(tenantId: string, entityType: string): Promise<void>;
  invalidateAttributesCache(tenantId: string, entityType: string): Promise<void>;
  queryRaw<T = unknown>(query: string, ...values: unknown[]): Promise<T[]>;
  deleteEntityType(tenantId: string, entityType: string): Promise<void>;
}

export class PrismaEntityRepository implements IEntityRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: RedisClient,
  ) {}

  async ensureEntityType(tenantId: string, entityType: string): Promise<{ id: string; name: string }> {
    const existing = await this.prisma.entityType.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: entityType,
        },
      },
    });

    if (existing) {
      return { id: existing.id, name: existing.name };
    }

    const created = await this.prisma.entityType.create({
      data: {
        tenantId,
        name: entityType,
        data: [] as any,
      },
    });

    return { id: created.id, name: created.name };
  }

  async upsertAttribute(args: {
    tenantId: string;
    entityTypeId: string;
    key: string;
    type: string;
    operators: unknown;
    values: unknown;
  }): Promise<void> {
    await this.prisma.entityAttribute.upsert({
      where: {
        tenantId_entityTypeId_key: {
          tenantId: args.tenantId,
          entityTypeId: args.entityTypeId,
          key: args.key,
        },
      },
      update: {
        type: args.type,
        operators: args.operators as any,
        values: args.values as any,
      },
      create: {
        tenantId: args.tenantId,
        entityTypeId: args.entityTypeId,
        key: args.key,
        type: args.type,
        operators: args.operators as any,
        values: args.values as any,
      },
    });
  }

  async createManyEntities(args: {
    tenantId: string;
    entityTypeId: string;
    records: Record<string, unknown>[];
  }): Promise<void> {
    if (args.records.length === 0) {
      return;
    }

    // Since we store all entities in a single JSON array, we need to append them.
    const dataset = await this.prisma.entityType.findUnique({
      where: { id: args.entityTypeId },
      select: { data: true },
    });

    const existingData = Array.isArray(dataset?.data) ? (dataset.data as any[]) : [];
    const recordsWithIds = args.records.map(r => ({
      id: r.id || crypto.randomUUID(),
      ...r
    }));
    const newData = [...existingData, ...recordsWithIds];

    await this.prisma.entityType.update({
      where: { id: args.entityTypeId },
      data: {
        data: newData as any,
      },
    });
  }

  async listAttributes(tenantId: string, entityType: string): Promise<EntityAttributeView[]> {
    const cacheKey = attributeCacheKey(tenantId, entityType);
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as EntityAttributeView[];
      }
    }

    const entityTypeRecord = await this.prisma.entityType.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: entityType,
        },
      },
    });

    if (!entityTypeRecord) {
      return [];
    }

    const attributes = await this.prisma.entityAttribute.findMany({
      where: {
        tenantId,
        entityTypeId: entityTypeRecord.id,
      },
      orderBy: {
        key: 'asc',
      },
    });

    const response = attributes.map((item) => ({
      key: item.key,
      type: item.type,
      operators: item.operators,
      values: item.values,
    }));
    
    logger.info({ tenantId, entityType, attributeCount: response.length }, 'PrismaEntityRepository: listed attributes');

    if (this.redis) {
      await this.redis.set(cacheKey, JSON.stringify(response), 'EX', ATTRIBUTE_CACHE_TTL_SECONDS);
    }

    return response;
  }

  async listEntityTypes(tenantId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.entityType.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findEntityTypeId(tenantId: string, entityType: string): Promise<string | null> {
    const cacheKey = entityTypeIdCacheKey(tenantId, entityType);
    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const entityTypeRecord = await this.prisma.entityType.findFirst({
      where: {
        tenantId,
        name: {
          equals: entityType,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });

    const id = entityTypeRecord?.id ?? null;
    if (this.redis && id) {
      await this.redis.set(cacheKey, id, 'EX', ENTITY_TYPE_ID_CACHE_TTL_SECONDS);
    }

    return id;
  }

  async invalidateEntityTypeCache(tenantId: string, entityType: string): Promise<void> {
    if (!this.redis) {
      return;
    }
    await this.redis.del(entityTypeIdCacheKey(tenantId, entityType));
  }

  async invalidateAttributesCache(tenantId: string, entityType: string): Promise<void> {
    if (!this.redis) {
      return;
    }
    await this.redis.del(attributeCacheKey(tenantId, entityType));
  }

  async queryRaw<T = unknown>(query: string, ...values: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe(query, ...values);
  }

  async deleteEntityType(tenantId: string, entityType: string): Promise<void> {
    const entityTypeRecord = await this.prisma.entityType.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name: entityType,
        },
      },
    });

    if (!entityTypeRecord) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Delete Attributes
      await tx.entityAttribute.deleteMany({
        where: {
          tenantId,
          entityTypeId: entityTypeRecord.id,
        },
      });

      // 2. Delete EntityType itself
      await tx.entityType.delete({
        where: {
          id: entityTypeRecord.id,
        },
      });
    });

    await this.invalidateEntityTypeCache(tenantId, entityType);
    await this.invalidateAttributesCache(tenantId, entityType);
  }
}
