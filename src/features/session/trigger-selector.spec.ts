import { describe, expect, it } from 'vitest';
import { selectFlowByTrigger, type TriggerSelectableFlow } from './trigger-selector';

function flow(
  id: string,
  triggerConfig: TriggerSelectableFlow['triggerConfig'],
  updatedAt: string,
): TriggerSelectableFlow {
  return { id, triggerConfig, updatedAt: new Date(updatedAt) };
}

describe('selectFlowByTrigger', () => {
  it('prefers explicit keyword/comparison flow over catch-all flow', () => {
    const explicit = flow(
      'explicit-flow',
      { comparisons: [{ operator: 'EQUALS', value: 'book order' }], logicalOperator: 'OR' },
      '2026-04-05T00:00:00.000Z',
    );
    const catchAll = flow('catch-all', { logicalOperator: 'OR' }, '2026-04-06T00:00:00.000Z');

    const selected = selectFlowByTrigger([catchAll, explicit], 'book order');
    expect(selected?.id).toBe('explicit-flow');
  });

  it('falls back to catch-all when no explicit trigger matches', () => {
    const explicit = flow(
      'explicit-flow',
      { comparisons: [{ operator: 'EQUALS', value: 'haan' }], logicalOperator: 'OR' },
      '2026-04-05T00:00:00.000Z',
    );
    const catchAll = flow('catch-all', { logicalOperator: 'OR' }, '2026-04-06T00:00:00.000Z');

    const selected = selectFlowByTrigger([explicit, catchAll], 'book order');
    expect(selected?.id).toBe('catch-all');
  });

  it('chooses the highest-scoring explicit match', () => {
    const containsFlow = flow(
      'contains',
      { comparisons: [{ operator: 'CONTAINS', value: 'book' }], logicalOperator: 'OR' },
      '2026-04-05T00:00:00.000Z',
    );
    const equalsFlow = flow(
      'equals',
      { comparisons: [{ operator: 'EQUALS', value: 'book order' }], logicalOperator: 'OR' },
      '2026-04-04T00:00:00.000Z',
    );

    const selected = selectFlowByTrigger([containsFlow, equalsFlow], 'book order');
    expect(selected?.id).toBe('equals');
  });

  it('still picks explicit flow when message has punctuation', () => {
    const explicit = flow(
      'explicit-flow',
      { comparisons: [{ operator: 'EQUALS', value: 'book order' }], logicalOperator: 'OR' },
      '2026-04-05T00:00:00.000Z',
    );
    const catchAll = flow('catch-all', { logicalOperator: 'OR' }, '2026-04-06T00:00:00.000Z');

    const selected = selectFlowByTrigger([catchAll, explicit], 'book order!');
    expect(selected?.id).toBe('explicit-flow');
  });
});
