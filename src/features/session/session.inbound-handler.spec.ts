import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SessionInboundHandler } from './session.inbound-handler';
import { FlowEntity } from '../flow/flow.entity';
import type { IFlowRepository } from '../flow/flow.repository';
import type { ISessionRepository } from './session.repository';
import type { IEnginePlugin } from '../../plugins/engine';
import type { IRedisPlugin } from '../../plugins/redis';
import type { IStoragePlugin } from '../../plugins/storage';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';
import type { IRenudgeService } from '../renudge/renudge.service';
import type { MsAssistantService } from '../ms-assistant';
import type { InboundJob } from '../../plugins/worker/jobs';
import { NodeType } from '../../schemas/node-types.enum';

Reflect.set(globalThis, 'logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

function makeJob(overrides: Partial<InboundJob['message']> & { text?: string } = {}): InboundJob {
  return {
    orgId: 'org-1',
    skipCredentialLookup: true,
    message: {
      messageId: 'msg-1',
      waId: '15550001111',
      waBusinessNumber: '1234567890',
      text: overrides.text ?? 'hello there',
      type: 'text',
      timestamp: Date.now(),
      ...overrides,
    },
  };
}

function makeFlow(id: string, keyword: string): FlowEntity {
  return new FlowEntity({
    id,
    orgId: 'org-1',
    name: `Flow ${id}`,
    status: 'published',
    triggerType: 'keyword',
    triggerConfig: {
      comparisons: [{ operator: 'EQUALS', value: keyword }],
      logicalOperator: 'OR',
    },
    nodes: [{ id: 'start', type: NodeType.START, data: {} } as any],
    edges: [],
    settings: {
      timeoutSeconds: 86400,
      maxSteps: 100,
      maxConsecutiveLogicSteps: 10,
      fallbackMessage: 'fallback',
    },
    updatedAt: new Date('2026-04-05T00:00:00.000Z'),
  });
}

function createHandler(opts: {
  flows?: FlowEntity[];
  activeSession?: Record<string, unknown> | null;
  msAssistant?: Partial<MsAssistantService> | null;
  enginePlugin?: Partial<IEnginePlugin>;
}) {
  const redisClient = {
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
  };

  const flowRepo = {
    findByOrgId: vi.fn().mockResolvedValue(opts.flows ?? []),
    findByIdOrFail: vi.fn(),
    findById: vi.fn(),
    getTranslation: vi.fn().mockResolvedValue(null),
  } as unknown as IFlowRepository;

  const sessionRepo = {
    findCurrentByWhatsApp: vi.fn().mockResolvedValue(opts.activeSession ?? null),
    findLastSession: vi.fn(),
    clearCurrentFlags: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (session) => ({ ...session, id: 'session-new' })),
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as ISessionRepository;

  const enginePlugin = {
    startFlow: vi.fn().mockResolvedValue({
      session: {
        flowId: 'flow-matched',
        flowVersion: 1,
        status: 'waiting',
        currentNodeId: 'start',
        variables: {},
        history: [],
        waitingFor: undefined,
        returnMark: undefined,
        flowStack: [],
        isCurrent: true,
      },
      outboundMessages: [{ type: NodeType.SEND_TEXT, payload: { message: 'started' } }],
    }),
    resumeFlow: vi.fn().mockResolvedValue({
      session: {
        status: 'waiting',
        currentNodeId: 'node-2',
        variables: {},
        history: [],
        waitingFor: undefined,
        isCurrent: true,
      },
      outboundMessages: [{ type: NodeType.SEND_TEXT, payload: { message: 'resumed' } }],
    }),
    ...opts.enginePlugin,
  } as unknown as IEnginePlugin;

  const redisPlugin = { client: redisClient } as unknown as IRedisPlugin;
  const storagePlugin = {} as IStoragePlugin;
  const whatsappPlugin = {} as IWhatsAppPlugin;
  const credentialRepo = {} as ICredentialRepository;
  const renudgeService = {
    scheduleFirstNudge: vi.fn().mockResolvedValue(undefined),
  } as unknown as IRenudgeService;

  let msAssistant: MsAssistantService | undefined;
  if (opts.msAssistant !== null && opts.msAssistant !== undefined) {
    msAssistant = {
      enabled: true,
      handleInbound: vi.fn().mockResolvedValue([
        {
          waId: '15550001111',
          waBusinessNumber: '1234567890',
          messageType: NodeType.SEND_TEXT,
          payload: { message: 'genai reply' },
          orgId: 'org-1',
        },
      ]),
      ...opts.msAssistant,
    } as unknown as MsAssistantService;
  } else if (opts.msAssistant === null) {
    msAssistant = undefined;
  }

  const handler = new SessionInboundHandler(
    flowRepo,
    sessionRepo,
    enginePlugin,
    redisPlugin,
    storagePlugin,
    whatsappPlugin,
    credentialRepo,
    renudgeService,
    msAssistant,
  );

  return { handler, flowRepo, sessionRepo, enginePlugin, msAssistant, redisClient };
}

describe('SessionInboundHandler routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes to GenAI when no intent matches and assistant is enabled', async () => {
    const { handler, msAssistant, enginePlugin } = createHandler({
      flows: [makeFlow('flow-a', 'book order')],
      msAssistant: { enabled: true },
    });

    const result = await handler.process(makeJob({ text: 'random question about SAP' }));

    expect(msAssistant!.handleInbound).toHaveBeenCalledTimes(1);
    expect(enginePlugin.startFlow).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.payload).toEqual({ message: 'genai reply' });
  });

  it('returns empty when no intent matches and assistant is disabled', async () => {
    const { handler, enginePlugin } = createHandler({
      flows: [makeFlow('flow-a', 'book order')],
      msAssistant: { enabled: false, handleInbound: vi.fn() },
    });

    const result = await handler.process(makeJob({ text: 'random question' }));

    expect(result).toEqual([]);
    expect(enginePlugin.startFlow).not.toHaveBeenCalled();
  });

  it('returns empty when no intent matches and assistant is absent', async () => {
    const { handler, enginePlugin } = createHandler({
      flows: [makeFlow('flow-a', 'book order')],
      msAssistant: null,
    });

    const result = await handler.process(makeJob({ text: 'random question' }));

    expect(result).toEqual([]);
    expect(enginePlugin.startFlow).not.toHaveBeenCalled();
  });

  it('starts matched flow and does not call GenAI', async () => {
    const matched = makeFlow('flow-matched', 'book order');
    const { handler, msAssistant, enginePlugin, sessionRepo } = createHandler({
      flows: [matched],
      msAssistant: { enabled: true },
    });

    const result = await handler.process(makeJob({ text: 'book order' }));

    expect(msAssistant!.handleInbound).not.toHaveBeenCalled();
    expect(enginePlugin.startFlow).toHaveBeenCalledTimes(1);
    expect(sessionRepo.create).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.payload).toEqual({ message: 'started' });
  });

  it('resumes active session and does not call GenAI', async () => {
    const flow = makeFlow('flow-active', 'book order');
    const activeSession = {
      id: 'session-1',
      flowId: 'flow-active',
      currentNodeId: 'start',
      variables: {},
      history: [],
      waitingFor: { type: 'text' },
      renudgeAttempts: 0,
    };

    const { handler, msAssistant, enginePlugin, flowRepo, sessionRepo } = createHandler({
      flows: [flow],
      activeSession,
      msAssistant: { enabled: true },
    });

    (flowRepo.findByIdOrFail as ReturnType<typeof vi.fn>).mockResolvedValue(flow);

    const result = await handler.process(makeJob({ text: 'some answer' }));

    expect(msAssistant!.handleInbound).not.toHaveBeenCalled();
    expect(enginePlugin.resumeFlow).toHaveBeenCalledTimes(1);
    expect(enginePlugin.startFlow).not.toHaveBeenCalled();
    expect(sessionRepo.update).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]?.payload).toEqual({ message: 'resumed' });
  });
});
