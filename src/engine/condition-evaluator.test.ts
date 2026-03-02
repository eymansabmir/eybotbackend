import { describe, it, expect, beforeEach } from 'vitest';
import { ConditionEvaluator } from './condition-evaluator';
import { VariableResolver } from './variable-resolver';
import { Session } from '../schemas/session.schema';
import { Contact } from '../schemas/contact.schema';
import { Flow } from '../schemas/flow.schema';

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;
  let mockSession: Session;
  let mockContact: Contact;
  let mockFlow: Flow;

  beforeEach(() => {
    const resolver = new VariableResolver();
    evaluator = new ConditionEvaluator(resolver);

    mockSession = {
      _id: 'session_1',
      flowId: 'flow_1',
      flowVersion: 1,
      contactId: 'contact_1',
      waId: '+1234567890',
      status: 'active',
      currentNodeId: 'node_1',
      variables: {
        age: 25,
        city: 'New York',
        answer: 'yes',
      },
      history: [],
    };

    mockContact = {
      _id: 'contact_1',
      orgId: 'org_1',
      waId: '+1234567890',
      name: 'John Doe',
      tags: [],
      customFields: {
        email: 'john@example.com',
      },
      optIn: true,
    };

    mockFlow = {
      orgId: 'org_1',
      name: 'Test Flow',
      status: 'published',
      version: 1,
      triggerType: 'inbound',
      triggerConfig: {},
      nodes: [],
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Error',
      },
    };
  });

  describe('Leaf Rules', () => {
    it('should evaluate eq comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.answer', comparator: 'eq', value: 'yes' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate neq comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.answer', comparator: 'neq', value: 'no' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate gt comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.age', comparator: 'gt', value: 20 },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate gte comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.age', comparator: 'gte', value: 25 },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate lt comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.age', comparator: 'lt', value: 30 },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate lte comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.age', comparator: 'lte', value: 25 },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate contains comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.city', comparator: 'contains', value: 'York' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate not_contains comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.city', comparator: 'not_contains', value: 'London' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate exists comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.age', comparator: 'exists' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate not_exists comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'session.unknown', comparator: 'not_exists' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate regex comparator', () => {
      const result = evaluator.evaluate(
        { variable: 'contact.customFields.email', comparator: 'regex', value: '^[a-z]+@' },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });
  });

  describe('AND Groups', () => {
    it('should evaluate AND with all true rules', () => {
      const result = evaluator.evaluate(
        {
          operator: 'AND',
          rules: [
            { variable: 'session.age', comparator: 'gt', value: 20 },
            { variable: 'session.answer', comparator: 'eq', value: 'yes' },
          ],
        },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate AND with one false rule', () => {
      const result = evaluator.evaluate(
        {
          operator: 'AND',
          rules: [
            { variable: 'session.age', comparator: 'gt', value: 20 },
            { variable: 'session.answer', comparator: 'eq', value: 'no' },
          ],
        },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(false);
    });
  });

  describe('OR Groups', () => {
    it('should evaluate OR with one true rule', () => {
      const result = evaluator.evaluate(
        {
          operator: 'OR',
          rules: [
            { variable: 'session.age', comparator: 'lt', value: 20 },
            { variable: 'session.answer', comparator: 'eq', value: 'yes' },
          ],
        },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });

    it('should evaluate OR with all false rules', () => {
      const result = evaluator.evaluate(
        {
          operator: 'OR',
          rules: [
            { variable: 'session.age', comparator: 'lt', value: 20 },
            { variable: 'session.answer', comparator: 'eq', value: 'no' },
          ],
        },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(false);
    });
  });

  describe('Nested Groups', () => {
    it('should evaluate nested AND/OR groups', () => {
      const result = evaluator.evaluate(
        {
          operator: 'AND',
          rules: [
            { variable: 'session.age', comparator: 'gte', value: 25 },
            {
              operator: 'OR',
              rules: [
                { variable: 'session.city', comparator: 'eq', value: 'New York' },
                { variable: 'session.city', comparator: 'eq', value: 'London' },
              ],
            },
          ],
        },
        { session: mockSession, contact: mockContact, flow: mockFlow }
      );
      expect(result).toBe(true);
    });
  });
});
