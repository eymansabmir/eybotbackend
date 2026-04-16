import type { RoutingConditionNode } from './condition.types';

export class QueryBuilder {
  private static readonly SAFE_FIELD_PATTERN = /^[a-zA-Z0-9_\.]+$/;

  private static formatField(field: string): string {
    if (!this.SAFE_FIELD_PATTERN.test(field)) {
      throw new Error(`Unsupported field '${field}' in query condition`);
    }
    // Keys are stored lowercase (e.g. "location.city").
    // Lowercase the field here to match, regardless of how the rule was authored.
    const normalizedField = field.toLowerCase();
    return `attributes->>'${normalizedField}'`;
  }

  static build(node: RoutingConditionNode, params: unknown[] = [], index = { i: 3 }): string {
    if ('children' in node) {
      const clauses = node.children.map((child) => this.build(child, params, index));
      return `(${clauses.join(` ${node.operator} `)})`;
    }

    const fieldExpression = `LOWER(TRIM(${this.formatField(node.field)}))`;
    const paramKey = `$${index.i++}`;
    
    // Process value for case-insensitive matching
    if (node.operator === 'in' || node.operator === 'not_in') {
      params.push(Array.isArray(node.value) ? node.value.map(v => String(v).toLowerCase().trim()) : []);
    } else {
      params.push(String(node.value).toLowerCase().trim());
    }

    switch (node.operator) {
      case 'equals':
        return `${fieldExpression} = ${paramKey}`;
      case 'not_equals':
        return `${fieldExpression} <> ${paramKey}`;
      case '<':
        return `(${fieldExpression})::numeric < ${paramKey}::numeric`;
      case '>':
        return `(${fieldExpression})::numeric > ${paramKey}::numeric`;
      case '<=':
        return `(${fieldExpression})::numeric <= ${paramKey}::numeric`;
      case '>=':
        return `(${fieldExpression})::numeric >= ${paramKey}::numeric`;
      case 'in':
        return `${fieldExpression} = ANY(${paramKey}::text[])`;
      case 'not_in':
        return `NOT (${fieldExpression} = ANY(${paramKey}::text[]))`;
      case 'contains':
        return `${fieldExpression} ILIKE '%' || ${paramKey} || '%'`;
      default:
        throw new Error('Unsupported operator in query builder');
    }
  }
}
