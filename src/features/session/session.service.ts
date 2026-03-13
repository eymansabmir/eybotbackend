import { SessionEntity } from './session.entity';
import { ISessionRepository } from './session.repository';
import { IFlowRepository } from '../flow/flow.repository';
import type { IEnginePlugin, OrchestratorResult, ContactInfo } from '../../plugins/engine';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import { ValidationError } from '../../utils/errors';
import { normalizeWaId } from '../../utils/whatsapp';

export interface StartSessionInput {
  orgId: string;
  flowId: string;
  waId: string;
  waBusinessNumber: string;
  contactName?: string;
  initialVariables?: Record<string, unknown>;
}

export interface ISessionService {
  startSession(input: StartSessionInput): Promise<{ session: SessionEntity; result: OrchestratorResult }>;
  resumeSession(sessionId: string, userInput: string): Promise<{ session: SessionEntity; result: OrchestratorResult }>;
  getSession(sessionId: string): Promise<SessionEntity>;
}

export class SessionService implements ISessionService {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly flowRepo: IFlowRepository,
    private readonly enginePlugin: IEnginePlugin,
    private readonly whatsappPlugin: IWhatsAppPlugin,
  ) {}

  async startSession(input: StartSessionInput): Promise<{ session: SessionEntity; result: OrchestratorResult }> {
    const { orgId, flowId, waBusinessNumber, contactName, initialVariables = {} } = input;
    const waId = normalizeWaId(input.waId);

    const flow = await this.flowRepo.findByIdOrFail(flowId);
    if (flow.status !== 'published') {
      throw new ValidationError(`Flow '${flowId}' is not published`);
    }

    const contact: ContactInfo = {
      waId,
      name: contactName ?? waId,
      customFields: {},
    };

    await this.sessionRepo.clearCurrentFlags(waBusinessNumber, waId);

    const result = await this.enginePlugin.startFlow(
      { orgId, flowId, waId, waBusinessNumber, initialVariables },
      flow,
      contact,
    );

    const saved = await this.sessionRepo.create(result.session);

    if (result.outboundMessages.length > 0) {
      await this.whatsappPlugin.sender.sendMessages(waId, result.outboundMessages, saved.id!);
    }

    return { session: saved, result };
  }

  async resumeSession(sessionId: string, userInput: string): Promise<{ session: SessionEntity; result: OrchestratorResult }> {
    const session = await this.sessionRepo.findByIdOrFail(sessionId);
    const flow = await this.flowRepo.findByIdOrFail(session.flowId);

    const contact: ContactInfo = {
      waId: session.waId,
      name: session.waId,
      customFields: {},
    };

    const result = await this.enginePlugin.resumeFlow(
      { sessionId, userInput },
      flow,
      contact,
      session,
    );

    const updated = await this.sessionRepo.update(session.id!, {
      status: result.session.status,
      currentNodeId: result.session.currentNodeId,
      variables: result.session.variables,
      history: result.session.history,
      waitingFor: result.session.waitingFor,
      isCurrent: result.session.isCurrent,
    });

    if (result.outboundMessages.length > 0) {
      await this.whatsappPlugin.sender.sendMessages(session.waId, result.outboundMessages, sessionId);
    }

    return { session: updated, result };
  }

  async getSession(sessionId: string): Promise<SessionEntity> {
    return this.sessionRepo.findByIdOrFail(sessionId);
  }
}
