import type { FlowEntity } from '../../features/flow/flow.entity';
import type { ContactEntity } from '../../features/contact/contact.entity';
import type { SessionEntity } from '../../features/session/session.entity';
import type { WaitingFor } from '../../features/session/session.entity';
import type { NodeType } from '../../schemas/node-types.enum';

export const ENGINE_PLUGIN = 'engine' as const;

export interface OutboundMessage {
  type: NodeType;
  payload: Record<string, unknown>;
}

export interface OrchestratorResult {
  session: SessionEntity;
  outboundMessages: OutboundMessage[];
  isFinished: boolean;
  waitingFor?: WaitingFor;
}

export interface StartFlowInput {
  orgId: string;
  flowId: string;
  contactId: string;
  waId: string;
  waBusinessNumber: string;
  initialVariables?: Record<string, unknown>;
}

export interface ResumeFlowInput {
  sessionId: string;
  userInput: string;
}

export interface IEnginePlugin {
  startFlow(
    input: StartFlowInput,
    flow: FlowEntity,
    contact: ContactEntity,
    existingSession?: SessionEntity,
  ): Promise<OrchestratorResult>;

  resumeFlow(
    input: ResumeFlowInput,
    flow: FlowEntity,
    contact: ContactEntity,
    session: SessionEntity,
  ): Promise<OrchestratorResult>;
}
