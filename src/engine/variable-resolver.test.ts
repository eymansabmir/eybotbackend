import { describe, it, expect, beforeEach } from 'vitest';
import { VariableResolver } from './variable-resolver';
import { Session } from '../schemas/session.schema';
import { Contact } from '../schemas/contact.schema';
import { Flow } from '../schemas/flow.schema';

describe('VariableResolver', () => {
  let resolver: VariableResolver;
  let mockSession: Session;
  let mockContact: Contact;
  let mockFlow: Flow;

  beforeEach(() => {
    resolver = new VariableResolver();

    mockSession = {
      _id: 'session_1',
      flowId: 'flow_1',
      flowVersion: 1,
      contactId: 'contact_1',
      waId: '+1234567890',
      status: 'active',
      currentNodeId: 'node_1',
      variables: {
        name: 'John',
        age: 30,
        city: 'New York',
      },
      history: [],
    };

    mockContact = {
      _id: 'contact_1',
      orgId: 'org_1',
      waId: '+1234567890',
      name: 'John Doe',
      tags: ['vip'],
      customFields: {
        email: 'john@example.com',
        company: 'Acme Inc',
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

  it('should resolve session variables', () => {
    const result = resolver.resolve('Hello {{session.name}}!', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('Hello John!');
  });

  it('should resolve contact custom fields', () => {
    const result = resolver.resolve('Email: {{contact.customFields.email}}', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('Email: john@example.com');
  });

  it('should resolve contact direct properties', () => {
    const result = resolver.resolve('Name: {{contact.name}}', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('Name: John Doe');
  });

  it('should resolve flow properties', () => {
    const result = resolver.resolve('Flow: {{flow.name}}', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('Flow: Test Flow');
  });

  it('should resolve system.now', () => {
    const result = resolver.resolve('Time: {{system.now}}', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toMatch(/Time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should resolve system.date', () => {
    const result = resolver.resolve('Date: {{system.date}}', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
  });

  it('should resolve multiple variables in one string', () => {
    const result = resolver.resolve('{{session.name}} from {{contact.customFields.company}}', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('John from Acme Inc');
  });

  it('should leave unresolved variables unchanged', () => {
    const result = resolver.resolve('Hello {{session.unknown}}!', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('Hello {{session.unknown}}!');
  });

  it('should handle strings without variables', () => {
    const result = resolver.resolve('Plain text', {
      session: mockSession,
      contact: mockContact,
      flow: mockFlow,
    });

    expect(result).toBe('Plain text');
  });
});
