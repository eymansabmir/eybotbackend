import type { RoutingConditionNode } from './condition.types';

export class QueryBuilder {
  private static readonly SAFE_FIELD_PATTERN = /^[a-zA-Z0-9_\.]+$/;

  private static formatField(field: string, activeEntityType?: string): string | null {
    if (!this.SAFE_FIELD_PATTERN.test(field)) {
      throw new Error(`Unsupported field '${field}' in query condition`);
    }

    const normalizedField = field;
    
    // If we have an active entity type, check if this field belongs to it
    if (activeEntityType) {
      const lowerField = normalizedField.toLowerCase();
      const lowerPrefix = `${activeEntityType.toLowerCase()}.`;
      
      if (lowerField.startsWith(lowerPrefix)) {
        // Strip prefix (e.g. "Users.age" -> "age")
        const stripped = normalizedField.slice(lowerPrefix.length);
        return `val->>'${stripped}'`;
      }
      
      // If it has a dot but doesn't match our active entity, it's for another entity
      if (normalizedField.includes('.')) {
        return null;
      }
    }

    // Default behavior for flat keys or no active entity context
    return `val->>'${normalizedField}'`;
  }

  static build(node: RoutingConditionNode, params: unknown[] = [], index = { i: 3 }, activeEntityType?: string): string {
    if ('children' in node) {
      const clauses = node.children.map((child) => this.build(child, params, index, activeEntityType));
      return `(${clauses.join(` ${node.operator} `)})`;
    }

    const fieldAccess = this.formatField(node.field, activeEntityType);
    
    // If field doesn't belong to this entity, return a falsy condition to avoid matching records from other datasets
    if (fieldAccess === null) {
      return "(1=0)";
    }

    const fieldExpression = `LOWER(TRIM(${fieldAccess}))`;
    const paramKey = `$${index.i++}`;
    
    // Process value for case-insensitive matching
    if (node.operator === 'in' || node.operator === 'not_in') {
      params.push(Array.isArray(node.value) ? node.value.map(v => String(v).toLowerCase().trim()) : []);
    } else {
      params.push(String(node.value).toLowerCase().trim());
    }

    let result: string;
    switch (node.operator) {
      case 'equals':
        result = `${fieldExpression} = ${paramKey}`;
        break;
      case 'not_equals':
        result = `${fieldExpression} <> ${paramKey}`;
        break;
      case '<':
        result = `(${fieldExpression})::numeric < ${paramKey}::numeric`;
        break;
      case '>':
        result = `(${fieldExpression})::numeric > ${paramKey}::numeric`;
        break;
      case '<=':
        result = `(${fieldExpression})::numeric <= ${paramKey}::numeric`;
        break;
      case '>=':
        result = `(${fieldExpression})::numeric >= ${paramKey}::numeric`;
        break;
      case 'in':
        result = `${fieldExpression} = ANY(${paramKey}::text[])`;
        break;
      case 'not_in':
        result = `NOT (${fieldExpression} = ANY(${paramKey}::text[]))`;
        break;
      case 'contains':
        result = `${fieldExpression} ILIKE '%' || ${paramKey} || '%'`;
        break;
      default:
        throw new Error('Unsupported operator in query builder');
    }
    
    console.log(`QueryBuilder Build: ${node.field} ${node.operator} ${node.value} (Entity: ${activeEntityType}) => ${result}`);
    return result;
  }
}
