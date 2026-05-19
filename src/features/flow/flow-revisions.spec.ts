import { describe, expect, it, vi } from 'vitest';
import { FlowService } from './flow.service';
import { FlowEntity } from './flow.entity';
import type { IFlowRepository } from './flow.repository';
import { NodeType } from '../../schemas/node-types.enum';

// Setup global mock logger to prevent reference errors during tests
Reflect.set(globalThis, 'logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('Flow Revisions Feature', () => {
  it('does not create an initial revision on createFlow if draft', async () => {
    const mockCreatedFlow = new FlowEntity({
      id: 'flow-1',
      orgId: 'org-1',
      name: 'Test Bot',
      status: 'draft',
      version: 1,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hello'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.START, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
    });

    const mockRepo = {
      create: vi.fn().mockResolvedValue(mockCreatedFlow),
      getLatestRevisionVersion: vi.fn().mockResolvedValue(0),
      getRevisions: vi.fn().mockResolvedValue([]),
      createRevision: vi.fn().mockResolvedValue(undefined),
      pruneOldRevisions: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFlowRepository;

    const service = new FlowService(mockRepo);
    vi.spyOn(service as any, 'validateTriggerUniqueness').mockResolvedValue(undefined);

    const result = await service.createFlow({
      orgId: 'org-1',
      name: 'Test Bot',
      triggerType: 'keyword',
      nodes: [{ id: 'n-1', type: NodeType.START, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
    });

    expect(result.id).toBe('flow-1');
    expect(mockRepo.create).toHaveBeenCalled();
    expect(mockRepo.createRevision).not.toHaveBeenCalled();
    expect(mockRepo.pruneOldRevisions).not.toHaveBeenCalled();
  });

  it('does not create a revision on updateFlow if draft', async () => {
    const existingFlow = new FlowEntity({
      id: 'flow-1',
      orgId: 'org-1',
      name: 'Test Bot',
      status: 'draft',
      version: 1,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hello'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.START, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
    });

    const mockUpdatedFlow = new FlowEntity({
      ...existingFlow,
      name: 'Updated Name',
    });

    const mockRepo = {
      findByIdOrFail: vi.fn().mockResolvedValue(existingFlow),
      update: vi.fn().mockResolvedValue(mockUpdatedFlow),
      getLatestRevisionVersion: vi.fn().mockResolvedValue(5),
      getRevisions: vi.fn().mockResolvedValue([]),
      createRevision: vi.fn().mockResolvedValue(undefined),
      pruneOldRevisions: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFlowRepository;

    const service = new FlowService(mockRepo);
    vi.spyOn(service as any, 'validateTriggerUniqueness').mockResolvedValue(undefined);

    const result = await service.updateFlow('flow-1', { name: 'Updated Name' });

    expect(result.name).toBe('Updated Name');
    expect(mockRepo.update).toHaveBeenCalledWith('flow-1', { name: 'Updated Name' });
    expect(mockRepo.createRevision).not.toHaveBeenCalled();
    expect(mockRepo.pruneOldRevisions).not.toHaveBeenCalled();
  });

  it('rolls back to a previous revision structure but does NOT create a new revision entry immediately', async () => {
    const existingFlow = new FlowEntity({
      id: 'flow-1',
      orgId: 'org-1',
      name: 'Current Bot Design',
      status: 'draft',
      version: 1,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hello'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-2', type: NodeType.SEND_TEXT, data: {} }, { id: 'n-3', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
    });

    const mockRevision = {
      id: 'rev-10',
      flowId: 'flow-1',
      version: 2,
      name: 'Design Version 2',
      description: 'Older stable layout',
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hi'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.SEND_TEXT, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
      isPublished: false,
    };

    const mockRolledBackFlow = new FlowEntity({
      id: 'flow-1',
      orgId: 'org-1',
      name: 'Design Version 2',
      status: 'draft',
      version: 1,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hi'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.SEND_TEXT, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
    });

    const mockRepo = {
      findRevisionById: vi.fn().mockResolvedValue(mockRevision),
      findByIdOrFail: vi.fn().mockResolvedValue(existingFlow),
      update: vi.fn().mockResolvedValue(mockRolledBackFlow),
      getLatestRevisionVersion: vi.fn().mockResolvedValue(12),
      getRevisions: vi.fn().mockResolvedValue([]),
      createRevision: vi.fn().mockResolvedValue(undefined),
      pruneOldRevisions: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFlowRepository;

    const service = new FlowService(mockRepo);

    const result = await service.rollbackToRevision('flow-1', 'rev-10');

    expect(mockRepo.findRevisionById).toHaveBeenCalledWith('rev-10');
    expect(mockRepo.update).toHaveBeenCalledWith('flow-1', {
      name: 'Design Version 2',
      description: 'Older stable layout',
      triggerType: 'keyword',
      triggerConfig: mockRevision.triggerConfig,
      nodes: mockRevision.nodes,
      edges: mockRevision.edges,
      settings: mockRevision.settings,
    });
    expect(mockRepo.createRevision).not.toHaveBeenCalled();
    expect(mockRepo.pruneOldRevisions).not.toHaveBeenCalled();
    expect(result.name).toBe('Design Version 2');
  });

  it('creates revision and prunes old ones when publishing flow if no prior revisions exist', async () => {
    const existingFlow = new FlowEntity({
      id: 'flow-1',
      orgId: 'org-1',
      name: 'Stable Bot Layout',
      status: 'draft',
      version: 1,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hello'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.START, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
    });

    const mockPublishedFlow = new FlowEntity({
      ...existingFlow,
      status: 'published',
    });

    const mockRepo = {
      findByIdOrFail: vi.fn().mockResolvedValue(existingFlow),
      update: vi.fn().mockResolvedValue(mockPublishedFlow),
      getLatestRevisionVersion: vi.fn().mockResolvedValue(2),
      getRevisions: vi.fn().mockResolvedValue([]),
      createRevision: vi.fn().mockResolvedValue(undefined),
      pruneOldRevisions: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFlowRepository;

    const service = new FlowService(mockRepo);
    vi.spyOn(service as any, 'validateGraph').mockReturnValue(undefined);

    const result = await service.publishFlow('flow-1');

    expect(result.status).toBe('published');
    expect(mockRepo.getRevisions).toHaveBeenCalledWith('flow-1');
    expect(mockRepo.getLatestRevisionVersion).toHaveBeenCalledWith('flow-1');
    expect(mockRepo.createRevision).toHaveBeenCalledWith('flow-1', 3, mockPublishedFlow, true);
    expect(mockRepo.pruneOldRevisions).toHaveBeenCalledWith('flow-1');
  });

  it('skips creating a new revision on publishFlow if layout is identical to latest revision', async () => {
    const existingFlow = new FlowEntity({
      id: 'flow-1',
      orgId: 'org-1',
      name: 'Stable Bot Layout',
      status: 'draft',
      version: 1,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hello'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.START, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }] as any,
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
    });

    const mockPublishedFlow = new FlowEntity({
      ...existingFlow,
      status: 'published',
    });

    const mockLatestRevision = {
      id: 'rev-1',
      flowId: 'flow-1',
      version: 1,
      name: 'Stable Bot Layout',
      description: null,
      triggerType: 'keyword',
      triggerConfig: { keywords: ['hello'], logicalOperator: 'OR' },
      nodes: [{ id: 'n-1', type: NodeType.START, data: {} }, { id: 'n-2', type: NodeType.END, data: {} }],
      edges: [],
      settings: {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry',
      },
      isPublished: true,
    };

    const mockRepo = {
      findByIdOrFail: vi.fn().mockResolvedValue(existingFlow),
      update: vi.fn().mockResolvedValue(mockPublishedFlow),
      getLatestRevisionVersion: vi.fn().mockResolvedValue(1),
      getRevisions: vi.fn().mockResolvedValue([mockLatestRevision]),
      createRevision: vi.fn().mockResolvedValue(undefined),
      pruneOldRevisions: vi.fn().mockResolvedValue(undefined),
    } as unknown as IFlowRepository;

    const service = new FlowService(mockRepo);
    vi.spyOn(service as any, 'validateGraph').mockReturnValue(undefined);

    const result = await service.publishFlow('flow-1');

    expect(result.status).toBe('published');
    expect(mockRepo.getRevisions).toHaveBeenCalledWith('flow-1');
    // createRevision and pruneOldRevisions should NOT be called since structure is identical
    expect(mockRepo.createRevision).not.toHaveBeenCalled();
    expect(mockRepo.pruneOldRevisions).not.toHaveBeenCalled();
  });
});
