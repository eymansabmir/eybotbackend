import { NotFoundError } from '../../../utils/errors';
import { logger } from '../../../utils/logger';
import type { RoutingConditionNode } from '../domain/condition.types';
import type { IEntityRepository } from '../data/entity.repository';
import { QueryBuilder } from '../domain/query-builder';

export class EntityQueryService {
  constructor(private readonly entityRepo: IEntityRepository) {}

  async fetchEntitiesByRule(input: {
    tenantId: string;
    entityType: string;
    conditions: RoutingConditionNode;
    limit?: number;
    traceId?: string;
  }): Promise<Array<{ id: string; attributes: Record<string, unknown> }>> {
    const entityTypeId = await this.entityRepo.findEntityTypeId(input.tenantId, input.entityType);
    if (!entityTypeId) {
      throw new NotFoundError('EntityType', `${input.tenantId}:${input.entityType}`);
    }

    const params: unknown[] = [input.tenantId, entityTypeId];
    const whereClause = QueryBuilder.build(input.conditions, params, { i: 3 }, input.entityType);
    const limit = input.limit ?? 1000;

    const query = `
      SELECT id, attributes
      FROM "Entity"
      WHERE "tenantId" = $1
      AND "entityTypeId" = $2
      AND ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${Math.min(limit, 5000)}
    `;

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_4_DB_QUERY',
        traceId: input.traceId,
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityTypeId,
        limit: Math.min(limit, 5000),
      },
      'Voice orchestration step',
    );

    const rows = await this.entityRepo.queryRaw<{ id: string; attributes: Record<string, unknown> }>(
      query,
      ...params,
    );

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_5_ENTITY_MATCH_COMPLETED',
        traceId: input.traceId,
        entityType: input.entityType,
        matchedCount: rows.length,
      },
      'Voice orchestration step',
    );

    return rows;
  }

  async queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T[]> {
    return this.entityRepo.queryRaw<T>(query, ...params);
  }
}
