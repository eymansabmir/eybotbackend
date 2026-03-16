import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IEnginePlugin, ContactInfo, StartFlowInput, ResumeFlowInput, OrchestratorResult } from './engine.interface';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { SessionEntity } from '../../features/session/session.entity';
import { FlowOrchestrator } from './orchestrator';

export class EnginePlugin implements IPlugin, IEnginePlugin {
  readonly name = 'engine';

  private _orchestrator!: FlowOrchestrator;

  async initialize(_registry: IPluginRegistry): Promise<void> {
    this._orchestrator = new FlowOrchestrator();
    logger.info('EnginePlugin: flow execution engine ready');
  }

  async shutdown(): Promise<void> {
    // Pure computation — nothing to close.
  }

  startFlow(
    input: StartFlowInput,
    flow: FlowEntity,
    contact: ContactInfo,
  ): Promise<OrchestratorResult> {
    const result = this._orchestrator.startFlow(
      flow,
      contact,
      input.initialVariables ?? {},
      input.flowId,
      input.waId,
      input.waBusinessNumber,
    );
    return Promise.resolve(result);
  }

  resumeFlow(
    input: ResumeFlowInput,
    flow: FlowEntity,
    contact: ContactInfo,
    session: SessionEntity,
  ): Promise<OrchestratorResult> {
    const result = this._orchestrator.resumeFlow(flow, contact, session, input.userInput);
    return Promise.resolve(result);
  }
}
