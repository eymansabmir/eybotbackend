import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IEnginePlugin, StartFlowInput, ResumeFlowInput, OrchestratorResult } from './engine.interface';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { ContactEntity } from '../../features/contact/contact.entity';
import type { SessionEntity } from '../../features/session/session.entity';
import { FlowOrchestrator } from './orchestrator';

export class EnginePlugin implements IPlugin, IEnginePlugin {
  readonly name = 'engine';

  private _orchestrator!: FlowOrchestrator;

  async initialize(_registry: IPluginRegistry): Promise<void> {
    this._orchestrator = new FlowOrchestrator();
    console.log('[EnginePlugin] Flow execution engine ready');
  }

  async shutdown(): Promise<void> {
    // Pure computation — nothing to close.
  }

  startFlow(
    input: StartFlowInput,
    flow: FlowEntity,
    contact: ContactEntity,
  ): Promise<OrchestratorResult> {
    const { result } = this._orchestrator.startFlow(
      flow,
      contact,
      input.initialVariables ?? {},
      input.flowId,
      input.contactId,
      input.waId,
      input.waBusinessNumber,
    );
    return Promise.resolve(result);
  }

  resumeFlow(
    _input: ResumeFlowInput,
    flow: FlowEntity,
    contact: ContactEntity,
    session: SessionEntity,
  ): Promise<OrchestratorResult> {
    const { result } = this._orchestrator.resumeFlow(flow, contact, session, _input.userInput);
    return Promise.resolve(result);
  }

  /**
   * Exposes the raw orchestrator for the session service which needs
   * both the result and the contact mutations in a single call.
   */
  get orchestrator(): FlowOrchestrator {
    return this._orchestrator;
  }
}
