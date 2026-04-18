import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

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
  listEntityTypes(tenantId: string): Promise<string[]>;
  listAttributes(tenantId: string, entityType: string): Promise<EntityAttributeView[]>;
  findEntityTypeId(tenantId: string, entityType: string): Promise<string | null>;
  invalidateEntityTypeCache(tenantId: string, entityType: string): Promise<void>;
  invalidateAttributesCache(tenantId: string, entityType: string): Promise<void>;
  queryRaw<T = unknown>(query: string, ...values: unknown[]): Promise<T[]>;
}

export class PrismaEntityRepository implements IEntityRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis?: Redis,
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

    await this.prisma.entity.createMany({
      data: args.records.map((record) => ({
        tenantId: args.tenantId,
        entityTypeId: args.entityTypeId,
        attributes: record as any,
      })),
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

  async listEntityTypes(tenantId: string): Promise<string[]> {
    const types = await this.prisma.entityType.findMany({
      where: { tenantId },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return types.map((t) => t.name);
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
}
