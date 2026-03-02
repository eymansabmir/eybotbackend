import { Node } from '../schemas/node.schema';
import { Session, SessionHistoryStep, WaitingFor } from '../schemas/session.schema';
import { Contact } from '../schemas/contact.schema';
import { Flow } from '../schemas/flow.schema';
import { NodeType } from '../schemas/node-types.enum';

export interface OutboundMessage {
  type: NodeType;
  payload: Record<string, any>;
}

export interface VariableMutation {
  scope: 'session' | 'contact';
  key: string;
  value: any;
}

export interface ExecutionInput {
  session: Session;
  contact: Contact;
  flow: Flow;
  currentNode: Node;
  userInput?: string;
}

export interface ExecutionResult {
  nextNodeId: string | null;
  outboundMessages: OutboundMessage[];
  variableMutations: VariableMutation[];
  waitForInput?: WaitingFor;
  historyStep: SessionHistoryStep;
  isTerminal: boolean;
}

export interface StartFlowInput {
  orgId: string;
  flowId: string;
  contactId: string;
  waId: string;
  waBusinessNumber: string;
  initialVariables?: Record<string, any>;
}

export interface ResumeFlowInput {
  sessionId: string;
  userInput: string;
}

export interface OrchestratorResult {
  session: Session;
  outboundMessages: OutboundMessage[];
  isFinished: boolean;
  waitingFor?: WaitingFor;
}
