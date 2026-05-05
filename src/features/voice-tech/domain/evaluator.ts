import type { ConditionGroup, ConditionLeaf, RoutingConditionNode } from './condition.types';

export class ConditionEvaluator {
  static evaluate(node: RoutingConditionNode, context: Record<string, unknown>): boolean {
    if ('children' in node) {
      const group = node as ConditionGroup;
      if (group.operator === 'AND') {
        return group.children.every((child) => this.evaluate(child, context));
      }
      return group.children.some((child) => this.evaluate(child, context));
    }

    const leaf = node as ConditionLeaf;
    const actualValue = context[leaf.field];
    return this.compare(actualValue, leaf.operator, leaf.value);
  }

  private static compare(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      case '<':
        return Number(actual) < Number(expected);
      case '>':
        return Number(actual) > Number(expected);
      case '<=':
        return Number(actual) <= Number(expected);
      case '>=':
        return Number(actual) >= Number(expected);
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      default:
        return false;
    }
  }
}
