import { NotFoundError } from '../../../utils/errors';
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
  }): Promise<Array<{ id: string; attributes: Record<string, unknown> }>> {
    const entityTypeId = await this.entityRepo.findEntityTypeId(input.tenantId, input.entityType);
    if (!entityTypeId) {
      throw new NotFoundError('EntityType', `${input.tenantId}:${input.entityType}`);
    }

    const params: unknown[] = [input.tenantId, entityTypeId];
    const whereClause = QueryBuilder.build(input.conditions, params);
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

    const rows = await this.entityRepo.queryRaw<{ id: string; attributes: Record<string, unknown> }>(
      query,
      ...params,
    );

    return rows;
  }
}
