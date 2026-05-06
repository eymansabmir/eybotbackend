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
    countOnly?: boolean;
  }): Promise<Array<{ id: string; attributes: Record<string, unknown> }> | number> {
    const datasetId = await this.entityRepo.findEntityTypeId(input.tenantId, input.entityType);
    if (!datasetId) {
      throw new NotFoundError('Dataset', `${input.tenantId}:${input.entityType}`);
    }

    const params: unknown[] = [input.tenantId, datasetId];
    // Note: QueryBuilder now uses 'val' as the identifier for the expanded JSON object
    const whereClause = QueryBuilder.build(input.conditions, params, { i: 3 }, input.entityType);
    const limit = input.limit ?? 1000;
    const countOnly = input.countOnly ?? false;

    if (countOnly) {
      const countQuery = `
        SELECT COUNT(*)
        FROM (
          SELECT jsonb_array_elements(COALESCE(data, '[]'::jsonb)) as val
          FROM "datasets"
          WHERE "tenantId" = $1
          AND "id" = $2
        ) as sub
        WHERE ${whereClause}
      `;
      logger.info({ tenantId: input.tenantId, entityType: input.entityType, countQuery, params }, 'Audience count query');
      const result = await this.entityRepo.queryRaw<{ count: string | number | bigint }>(countQuery, ...params);
      const firstRow = result[0] as any;
      if (!firstRow) return 0;

      const rawCount = firstRow.count ?? firstRow.COUNT ?? Object.values(firstRow)[0];
      const count = typeof rawCount === 'bigint' ? Number(rawCount) : parseInt(String(rawCount), 10);
      return isNaN(count) ? 0 : count;
    }

    const query = `
      SELECT val->>'id' as id, val as attributes
      FROM (
        SELECT jsonb_array_elements(COALESCE(data, '[]'::jsonb)) as val
        FROM "datasets"
        WHERE "tenantId" = $1
        AND "id" = $2
      ) as sub
      WHERE ${whereClause}
      LIMIT ${Math.min(limit, 5000)}
    `;

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_4_DB_QUERY',
        traceId: input.traceId,
        tenantId: input.tenantId,
        entityType: input.entityType,
        datasetId,
        limit: Math.min(limit, 5000),
      },
      'Voice orchestration step',
    );

    const rows = await this.entityRepo.queryRaw<{ id: string; attributes: Record<string, unknown> }>(
      query,
      ...params,
    );

    return rows;
  }

  async queryRaw<T = unknown>(query: string, ...params: unknown[]): Promise<T[]> {
    return this.entityRepo.queryRaw<T>(query, ...params);
  }
}
