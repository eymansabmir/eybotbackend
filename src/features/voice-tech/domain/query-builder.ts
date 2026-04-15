import type { RoutingConditionNode } from './condition.types';

export class QueryBuilder {
  private static readonly SAFE_FIELD_PATTERN = /^[a-zA-Z0-9_]+$/;

  static build(node: RoutingConditionNode, params: unknown[] = [], index = { i: 3 }): string {
    if ('children' in node) {
      const clauses = node.children.map((child) => this.build(child, params, index));
      return `(${clauses.join(` ${node.operator} `)})`;
    }

    if (!this.SAFE_FIELD_PATTERN.test(node.field)) {
      throw new Error(`Unsupported field '${node.field}' in query condition`);
    }

    const paramKey = `$${index.i++}`;
    params.push(node.value);

    switch (node.operator) {
      case 'equals':
        return `attributes->>'${node.field}' = ${paramKey}`;
      case 'not_equals':
        return `attributes->>'${node.field}' <> ${paramKey}`;
      case '<':
        return `(attributes->>'${node.field}')::numeric < ${paramKey}::numeric`;
      case '>':
        return `(attributes->>'${node.field}')::numeric > ${paramKey}::numeric`;
      case '<=':
        return `(attributes->>'${node.field}')::numeric <= ${paramKey}::numeric`;
      case '>=':
        return `(attributes->>'${node.field}')::numeric >= ${paramKey}::numeric`;
      case 'in':
        return `attributes->>'${node.field}' = ANY(${paramKey}::text[])`;
      case 'not_in':
        return `NOT (attributes->>'${node.field}' = ANY(${paramKey}::text[]))`;
      case 'contains':
        return `attributes->>'${node.field}' ILIKE '%' || ${paramKey} || '%'`;
      default:
        throw new Error('Unsupported operator in query builder');
    }
  }
}
