import { describe, expect, it } from 'vitest';
import { ConditionEvaluator } from './condition.evaluator';

describe('ConditionEvaluator', () => {
  it('treats missing config as catch-all', () => {
    expect(ConditionEvaluator.evaluate('hello', undefined)).toBe(true);
    expect(ConditionEvaluator.evaluate('', null)).toBe(true);
  });

  it('matches legacy keywords by containment (autobot-style)', () => {
    const config = { keywords: ['help', 'start'] };
    expect(ConditionEvaluator.evaluate('please help me', config as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('start!', config as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('unknown', config as any)).toBe(false);
  });

  it('treats empty comparison values as non-blocking and falls back to catch-all', () => {
    const config = {
      logicalOperator: 'AND',
      comparisons: [
        { operator: 'CONTAINS', value: '   ' },
        { operator: 'EQUALS', value: '' },
      ],
    };

    expect(ConditionEvaluator.evaluate('anything', config as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('', config as any)).toBe(true);
  });

  it('supports AND and OR comparison semantics', () => {
    const andConfig = {
      logicalOperator: 'AND',
      comparisons: [
        { operator: 'STARTS_WITH', value: 'hello' },
        { operator: 'ENDS_WITH', value: 'world' },
      ],
    };

    const orConfig = {
      logicalOperator: 'OR',
      comparisons: [
        { operator: 'EQUALS', value: 'ping' },
        { operator: 'CONTAINS', value: 'help' },
      ],
    };

    expect(ConditionEvaluator.evaluate('hello brave world', andConfig as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('hello only', andConfig as any)).toBe(false);

    expect(ConditionEvaluator.evaluate('ping', orConfig as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('need help now', orConfig as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('other text', orConfig as any)).toBe(false);
  });

  it('matches trigger text even with punctuation or extra spaces', () => {
    const config = {
      logicalOperator: 'OR',
      comparisons: [{ operator: 'EQUALS', value: 'book order' }],
    };

    expect(ConditionEvaluator.evaluate('book order!', config as any)).toBe(true);
    expect(ConditionEvaluator.evaluate('  book order   ', config as any)).toBe(true);
  });

  it('does not match when trigger config is explicitly disabled', () => {
    const disabledConfig = {
      enabled: false,
      logicalOperator: 'OR',
      comparisons: [{ operator: 'EQUALS', value: 'book order' }],
    };

    expect(ConditionEvaluator.evaluate('book order', disabledConfig as any)).toBe(false);
    expect(ConditionEvaluator.evaluate('anything', disabledConfig as any)).toBe(false);
  });
});