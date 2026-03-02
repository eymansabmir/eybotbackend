import { OrchestratorResult, StartFlowInput, ResumeFlowInput } from './types';
import { SessionDocument } from '../models/session.model';

export interface IFlowOrchestrator {
  startFlow(input: StartFlowInput): Promise<OrchestratorResult>;
  resumeFlow(input: ResumeFlowInput): Promise<OrchestratorResult>;
  handleTimedOutSessions(): Promise<void>;
  getSessionById(sessionId: string): Promise<SessionDocument>;
}
