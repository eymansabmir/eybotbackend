import type { ConditionExpression, LeafRule, Comparator } from '../../schemas/condition.schema';
import type { VariableContext } from './variable-resolver';
import { VariableResolver } from './variable-resolver';
import { SafeRegex } from '../../utils/safe-regex';

export class ConditionEvaluator {
  constructor(private readonly resolver: VariableResolver) {}

  async evaluate(expression: ConditionExpression, context: VariableContext): Promise<boolean> {
    if (this.isLeaf(expression)) return this.evaluateLeaf(expression, context);

    const { operator, rules } = expression;
    if (operator === 'AND') {
      for (const r of rules) {
        if (!(await this.evaluate(r, context))) return false;
      }
      return true;
    }
    if (operator === 'OR') {
      for (const r of rules) {
        if (await this.evaluate(r, context)) return true;
      }
      return false;
    }
    return false;
  }

  private isLeaf(expr: ConditionExpression): expr is LeafRule {
    return 'variable' in expr && 'comparator' in expr;
  }

  private async evaluateLeaf(rule: LeafRule, context: VariableContext): Promise<boolean> {
    const actual = this.resolver.resolveExpression(rule.variable, context);
    return this.compare(actual, rule.comparator, rule.value);
  }

  private async compare(actual: unknown, comparator: Comparator, expected: unknown): Promise<boolean> {
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
        try { 
          return await SafeRegex.test(String(expected), String(actual)); 
        } catch (err: any) { 
          // Log the error but return false to prevent flow crash
          console.warn(`[ConditionEvaluator] Regex check failed: ${err.message}`);
          return false; 
        }
      }
      default: return false;
    }
  }
}

