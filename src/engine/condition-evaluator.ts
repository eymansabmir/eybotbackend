import { ConditionExpression, LeafRule, Comparator } from '../schemas/condition.schema';
import { VariableResolver, VariableContext } from './variable-resolver';

export class ConditionEvaluator {
  constructor(private readonly variableResolver: VariableResolver) {}

  evaluate(expression: ConditionExpression, context: VariableContext): boolean {
    if (this.isLeafRule(expression)) {
      return this.evaluateLeafRule(expression, context);
    }

    const { operator, rules } = expression;

    if (operator === 'AND') {
      return rules.every(rule => this.evaluate(rule, context));
    }

    if (operator === 'OR') {
      return rules.some(rule => this.evaluate(rule, context));
    }

    return false;
  }

  private isLeafRule(expression: ConditionExpression): expression is LeafRule {
    return 'variable' in expression && 'comparator' in expression;
  }

  private evaluateLeafRule(rule: LeafRule, context: VariableContext): boolean {
    const actualValue = this.variableResolver.resolveExpression(rule.variable, context);
    const expectedValue = rule.value;

    return this.compare(actualValue, rule.comparator, expectedValue);
  }

  private compare(actual: any, comparator: Comparator, expected: any): boolean {
    switch (comparator) {
      case 'eq':
        return actual == expected;

      case 'neq':
        return actual != expected;

      case 'gt':
        return Number(actual) > Number(expected);

      case 'gte':
        return Number(actual) >= Number(expected);

      case 'lt':
        return Number(actual) < Number(expected);

      case 'lte':
        return Number(actual) <= Number(expected);

      case 'contains':
        return String(actual).includes(String(expected));

      case 'not_contains':
        return !String(actual).includes(String(expected));

      case 'exists':
        return actual !== undefined && actual !== null && actual !== '';

      case 'not_exists':
        return actual === undefined || actual === null || actual === '';

      case 'regex':
        try {
          const regex = new RegExp(String(expected));
          return regex.test(String(actual));
        } catch {
          return false;
        }

      default:
        return false;
    }
  }
}
