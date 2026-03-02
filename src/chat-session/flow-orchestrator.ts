import { IFlowRepository } from '../repositories/flow.repository';
import { ISessionRepository } from '../repositories/session.repository';
import { IContactRepository } from '../repositories/contact.repository';
import { SessionDocument } from '../models/session.model';
import { ContactDocument } from '../models/contact.model';
import { Session, SessionHistoryStep } from '../schemas/session.schema';
import { Contact } from '../schemas/contact.schema';
import { NodeType } from '../schemas/node-types.enum';
import { GraphTraverser } from '../engine/graph-traverser';
import { FlowExecutionError, ValidationError } from '../utils/errors';
import { NodeExecutor } from './node-executor';
import {
  StartFlowInput,
  ResumeFlowInput,
  OrchestratorResult,
  OutboundMessage,
  ExecutionResult,
} from './types';
import { IFlowOrchestrator } from './flow-orchestrator.interface';

const MAX_LOOP_STEPS = 50;

export class FlowOrchestrator implements IFlowOrchestrator {
  constructor(
    private readonly flowRepository: IFlowRepository,
    private readonly sessionRepository: ISessionRepository,
    private readonly contactRepository: IContactRepository,
    private readonly nodeExecutor: NodeExecutor,
  ) {}

  async startFlow(input: StartFlowInput): Promise<OrchestratorResult> {
    const { flowId, contactId, waId, waBusinessNumber, initialVariables = {} } = input;

    const flow = await this.flowRepository.findByIdOrFail(flowId);
    if (flow.status !== 'published') {
      throw new ValidationError(`Flow '${flowId}' is not published`);
    }

    const startNode = flow.nodes.find(n => n.type === NodeType.START);
    if (!startNode) {
      throw new FlowExecutionError('Flow has no START node', flowId);
    }

    const contact = await this.contactRepository.findByIdOrFail(contactId);

    await this.sessionRepository.clearCurrentFlags(waBusinessNumber, waId);

    const session = await this.sessionRepository.create({
      flowId: flow._id ? String(flow._id) : flowId,
      flowVersion: flow.version,
      contactId,
      waId,
      waBusinessNumber,
      status: 'active',
      currentNodeId: startNode.id,
      variables: initialVariables,
      history: [],
      isCurrent: true,
    });

    return this.runExecutionLoop(session, contact, flow.toObject(), undefined);
  }

  async resumeFlow(input: ResumeFlowInput): Promise<OrchestratorResult> {
    const { sessionId, userInput } = input;

    const session = await this.sessionRepository.findByIdOrFail(sessionId);

    if (session.status === 'completed' || session.status === 'timed_out') {
      throw new ValidationError(`Session '${sessionId}' is already ${session.status}`);
    }

    if (session.status === 'error') {
      throw new ValidationError(`Session '${sessionId}' is in error state`);
    }

    const flow = await this.flowRepository.findByIdOrFail(session.flowId);
    const contact = await this.contactRepository.findByIdOrFail(session.contactId);

    await this.sessionRepository.clearCurrentFlags(session.waBusinessNumber, session.waId);

    const updatedSession = await this.sessionRepository.update(
      String(session._id),
      { status: 'active', waitingFor: undefined, isCurrent: true },
    );

    return this.runExecutionLoop(updatedSession, contact, flow.toObject(), userInput);
  }

  async handleTimedOutSessions(): Promise<void> {
    const timedOutSessions = await this.sessionRepository.findTimedOut();

    for (const session of timedOutSessions) {
      await this.sessionRepository.update(String(session._id), {
        status: 'timed_out',
        waitingFor: undefined,
        isCurrent: false,
      });
      console.warn(`Session ${session._id} timed out at node ${session.currentNodeId}`);
    }
  }

  async getSessionById(sessionId: string): Promise<SessionDocument> {
    return this.sessionRepository.findByIdOrFail(sessionId);
  }

  private async runExecutionLoop(
    sessionDoc: SessionDocument,
    contactDoc: ContactDocument,
    flow: any,
    userInput: string | undefined,
  ): Promise<OrchestratorResult> {
    const traverser = new GraphTraverser({ nodes: flow.nodes, edges: flow.edges });

    let session: Session = sessionDoc.toObject ? sessionDoc.toObject() : sessionDoc;
    const contact: Contact = contactDoc.toObject ? contactDoc.toObject() : (contactDoc as any);

    const allOutboundMessages: OutboundMessage[] = [];
    let stepCount = 0;
    let isFirstStep = true;

    while (true) {
      if (stepCount >= MAX_LOOP_STEPS) {
        await this.sessionRepository.update(String(session._id), { status: 'error' });
        throw new FlowExecutionError(
          `Execution loop exceeded ${MAX_LOOP_STEPS} steps`,
          session.currentNodeId,
        );
      }

      const currentNode = traverser.getNode(session.currentNodeId);

      let result: ExecutionResult;

      try {
        const execInput = isFirstStep && userInput !== undefined
          ? { session, contact, flow, currentNode, userInput }
          : { session, contact, flow, currentNode };
        result = this.nodeExecutor.execute(execInput, traverser);
      } catch (err) {
        await this.sessionRepository.update(String(session._id), { status: 'error' });
        throw err;
      }

      isFirstStep = false;
      stepCount++;

      session = await this.applyResult(String(session._id), session, contact, result);

      allOutboundMessages.push(...result.outboundMessages);

      if (result.waitForInput) {
        const finalSession = await this.sessionRepository.update(String(session._id), {
          status: 'waiting',
          waitingFor: result.waitForInput,
          currentNodeId: result.nextNodeId ?? session.currentNodeId,
          isCurrent: true,
        });
        return {
          session: finalSession.toObject() as unknown as Session,
          outboundMessages: allOutboundMessages,
          isFinished: false,
          waitingFor: result.waitForInput,
        };
      }

      if (result.isTerminal || result.nextNodeId === null) {
        await this.sessionRepository.update(String(session._id), {
          status: 'completed',
          waitingFor: undefined,
          isCurrent: false,
        });
        return {
          session: { ...session, status: 'completed', isCurrent: false },
          outboundMessages: allOutboundMessages,
          isFinished: true,
        };
      }

      session = { ...session, currentNodeId: result.nextNodeId! };
    }
  }

  private async applyResult(
    sessionId: string,
    session: Session,
    contact: Contact,
    result: ExecutionResult,
  ): Promise<Session> {
    const sessionMutations: Record<string, any> = {};
    const contactMutations: Record<string, any> = {};

    for (const mutation of result.variableMutations) {
      if (mutation.scope === 'session') {
        sessionMutations[mutation.key] = mutation.value;
      } else {
        contactMutations[mutation.key] = mutation.value;
      }
    }

    const updatedVariables = { ...session.variables, ...sessionMutations };
    const historyStep: SessionHistoryStep = result.historyStep;

    const updates: Partial<Session> = {
      variables: updatedVariables,
      currentNodeId: result.nextNodeId ?? session.currentNodeId,
      history: [...session.history, historyStep],
    };

    if (Object.keys(contactMutations).length > 0) {
      const existingFields = (contact.customFields ?? {}) as Record<string, any>;
      await this.contactRepository.update(String(contact._id), {
        customFields: { ...existingFields, ...contactMutations },
      });
    }

    const updated = await this.sessionRepository.update(sessionId, updates);
    return updated.toObject ? updated.toObject() : (updated as unknown as Session);
  }
}
