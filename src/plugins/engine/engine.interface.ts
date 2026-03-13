import type { FlowEntity } from '../../features/flow/flow.entity';
import type { SessionEntity } from '../../features/session/session.entity';
import type { WaitingFor } from '../../features/session/session.entity';
import type { NodeType } from '../../schemas/node-types.enum';

export const ENGINE_PLUGIN = 'engine' as const;

/**
 * Lightweight contact representation used by the engine.
 * Contact data is NOT persisted — it is derived from the inbound message
 * or session variables for each flow run.
 */
export interface ContactInfo {
  waId: string;
  name: string;
  customFields: Record<string, unknown>;
}

export interface OutboundMessage {
  type: NodeType;
  payload: Record<string, unknown>;
}

export interface OrchestratorResult {
  session: SessionEntity;
  outboundMessages: OutboundMessage[];
  isFinished: boolean;
  waitingFor?: WaitingFor;
  /** Variables that were mutated on the contact scope during this run. */
  contactMutations: Record<string, unknown>;
}

export interface StartFlowInput {
  orgId: string;
  flowId: string;
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
    contact: ContactInfo,
  ): Promise<OrchestratorResult>;

  resumeFlow(
    input: ResumeFlowInput,
    flow: FlowEntity,
    contact: ContactInfo,
    session: SessionEntity,
  ): Promise<OrchestratorResult>;
}
