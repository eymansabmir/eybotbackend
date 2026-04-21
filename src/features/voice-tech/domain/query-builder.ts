import type { RoutingConditionNode } from './condition.types';

export class QueryBuilder {
  private static readonly SAFE_FIELD_PATTERN = /^[a-zA-Z0-9_\.]+$/;

  private static formatField(field: string, activeEntityType?: string): string | null {
    if (!this.SAFE_FIELD_PATTERN.test(field)) {
      throw new Error(`Unsupported field '${field}' in query condition`);
    }

    const normalizedField = field.toLowerCase();
    
    // If we have an active entity type, check if this field belongs to it
    if (activeEntityType) {
      const prefix = `${activeEntityType.toLowerCase()}.`;
      if (normalizedField.startsWith(prefix)) {
        // Strip prefix (e.g. "user.age" -> "age")
        const stripped = normalizedField.slice(prefix.length);
        return `attributes->>'${stripped}'`;
      }
      
      // If it has a dot but doesn't match our active entity, it's for another entity
      if (normalizedField.includes('.')) {
        return null;
      }
    }

    // Default behavior for flat keys or no active entity context
    return `attributes->>'${normalizedField}'`;
  }

  static build(node: RoutingConditionNode, params: unknown[] = [], index = { i: 3 }, activeEntityType?: string): string {
    if ('children' in node) {
      const clauses = node.children.map((child) => this.build(child, params, index, activeEntityType));
      return `(${clauses.join(` ${node.operator} `)})`;
    }

    const fieldAccess = this.formatField(node.field, activeEntityType);
    
    // If field doesn't belong to this entity, return a truthy condition to avoid filtering out records
    if (fieldAccess === null) {
      return "(1=1)";
    }

    const fieldExpression = `LOWER(TRIM(${fieldAccess}))`;
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
