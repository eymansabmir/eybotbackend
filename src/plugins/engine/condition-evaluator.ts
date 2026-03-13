import type { ConditionExpression, LeafRule, Comparator } from '../../schemas/condition.schema';
import type { VariableContext } from './variable-resolver';
import { VariableResolver } from './variable-resolver';

export class ConditionEvaluator {
  constructor(private readonly resolver: VariableResolver) {}

  evaluate(expression: ConditionExpression, context: VariableContext): boolean {
    if (this.isLeaf(expression)) return this.evaluateLeaf(expression, context);

    const { operator, rules } = expression;
    if (operator === 'AND') return rules.every(r => this.evaluate(r, context));
    if (operator === 'OR') return rules.some(r => this.evaluate(r, context));
    return false;
  }

  private isLeaf(expr: ConditionExpression): expr is LeafRule {
    return 'variable' in expr && 'comparator' in expr;
  }

  private evaluateLeaf(rule: LeafRule, context: VariableContext): boolean {
    const actual = this.resolver.resolveExpression(rule.variable, context);
    return this.compare(actual, rule.comparator, rule.value);
  }

  private compare(actual: unknown, comparator: Comparator, expected: unknown): boolean {
    switch (comparator) {
      case 'eq': return actual == expected;
      case 'neq': return actual != expected;
      case 'gt': return Number(actual) > Number(expected);
      case 'gte': return Number(actual) >= Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'lte': return Number(actual) <= Number(expected);
      case 'contains': return String(actual).includes(String(expected));
      case 'not_contains': return !String(actual).includes(String(expected));
      case 'exists': return actual !== undefined && actual !== null && actual !== '';
      case 'not_exists': return actual === undefined || actual === null || actual === '';
      case 'regex': {
        try { return new RegExp(String(expected)).test(String(actual)); }
        catch { return false; }
      }
      default: return false;
    }
  }
}
