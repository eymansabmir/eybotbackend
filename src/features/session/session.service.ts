import { SessionEntity } from './session.entity';
import { ISessionRepository } from './session.repository';
import { IFlowRepository } from '../flow/flow.repository';
import type { IEnginePlugin, OrchestratorResult, ContactInfo } from '../../plugins/engine';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import type { IWorkerPlugin } from '../../plugins/worker';
import { EXCHANGES } from '../../plugins/worker';
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
    private readonly workerPlugin?: IWorkerPlugin,
  ) {}

  async startSession(input: StartSessionInput): Promise<{ session: SessionEntity; result: OrchestratorResult }> {
    const { orgId, flowId, waBusinessNumber, contactName, initialVariables = {} } = input;
    const waId = normalizeWaId(input.waId);

    logger.info({ orgId, flowId, waId }, 'SessionService: starting session');

    const flow = await this.flowRepo.findByIdOrFail(flowId);
    if (flow.status !== 'published') {
      logger.warn({ flowId, status: flow.status }, 'SessionService: flow not published');
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
    logger.info({ sessionId: saved.id, flowId, isFinished: result.isFinished }, 'SessionService: session started');

    if (result.outboundMessages.length > 0) {
      // Queue messages through RabbitMQ for consistent ordering with prefetch=1
      if (this.workerPlugin) {
        for (const msg of result.outboundMessages) {
          const outboundJob = {
            waId,
            waBusinessNumber: input.waBusinessNumber,
            messageType: msg.type,
            payload: msg.payload,
            orgId: input.orgId,
            sessionId: saved.id!,
          };
          await this.workerPlugin.publish(EXCHANGES.OUTBOUND, outboundJob, saved.id!);
        }
      } else {
        // Fallback: send directly if worker plugin is unavailable
        await this.whatsappPlugin.sender.sendMessages(waId, result.outboundMessages, saved.id!);
      }
    }


    return { session: saved, result };
  }

  async resumeSession(sessionId: string, userInput: string): Promise<{ session: SessionEntity; result: OrchestratorResult }> {
    logger.info({ sessionId }, 'SessionService: resuming session');

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
      returnMark: result.session.returnMark,
      isCurrent: result.session.isCurrent,
    });

    if (result.outboundMessages.length > 0) {
      // Queue messages through RabbitMQ for consistent ordering with prefetch=1
      if (this.workerPlugin) {
        for (const msg of result.outboundMessages) {
          const outboundJob = {
            waId: session.waId,
            waBusinessNumber: session.waBusinessNumber,
            messageType: msg.type,
            payload: msg.payload,
            orgId: '', // orgId is not stored in session, but required by OutboundJob interface
            sessionId,
          };
          await this.workerPlugin.publish(EXCHANGES.OUTBOUND, outboundJob, sessionId);
        }
      } else {
        // Fallback: send directly if worker plugin is unavailable
        await this.whatsappPlugin.sender.sendMessages(session.waId, result.outboundMessages, sessionId);
      }
    }

    logger.info({ sessionId, isFinished: result.isFinished }, 'SessionService: session resumed');
    return { session: updated, result };
  }

  async getSession(sessionId: string): Promise<SessionEntity> {
    return this.sessionRepo.findByIdOrFail(sessionId);
  }
}
