import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IEnginePlugin, ContactInfo, StartFlowInput, ResumeFlowInput, OrchestratorResult } from './engine.interface';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { SessionEntity } from '../../features/session/session.entity';
import { CREDENTIAL_SERVICE } from '../../features/repositories.interface';
import type { ICredentialService } from '../../features/credentials';
import { OpenAIIntegrationService } from '../openai';
import { OPENAI_PLUGIN, type IOpenAIPlugin } from '../openai';
import { FlowOrchestrator, type RuntimeIntegrations } from './orchestrator';

export class EnginePlugin implements IPlugin, IEnginePlugin {
  readonly name = 'engine';

  private _registry!: IPluginRegistry;
  private _orchestrator!: FlowOrchestrator;
  private _openAIService?: OpenAIIntegrationService;

  async initialize(registry: IPluginRegistry): Promise<void> {
    this._registry = registry;
    this._orchestrator = new FlowOrchestrator();
    logger.info('EnginePlugin: flow execution engine ready');
  }

  async shutdown(): Promise<void> {
    // Pure computation — nothing to close.
  }

  async startFlow(
    input: StartFlowInput,
    flow: FlowEntity,
    contact: ContactInfo,
  ): Promise<OrchestratorResult> {
    return this._orchestrator.startFlow(
      flow,
      contact,
      input.initialVariables ?? {},
      input.flowId,
      input.waId,
      input.waBusinessNumber,
      this.runtimeIntegrations(),
    );
  }

  async resumeFlow(
    input: ResumeFlowInput,
    flow: FlowEntity,
    contact: ContactInfo,
    session: SessionEntity,
  ): Promise<OrchestratorResult> {
    return this._orchestrator.resumeFlow(
      flow,
      contact,
      session,
      input.userInput,
      this.runtimeIntegrations(),
    );
  }

  private runtimeIntegrations(): RuntimeIntegrations {
    return {
      executeOpenAI: async ({ orgId, request }) => {
        const service = this.openAIService();
        const completion = await service.executeNode({
          orgId,
          credentialId: request.credentialId,
          model: request.model,
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          topP: request.topP,
          frequencyPenalty: request.frequencyPenalty,
          presencePenalty: request.presencePenalty,
          timeoutMs: request.timeoutMs,
        });

        return { text: completion.content };
      },
    };
  }

  private openAIService(): OpenAIIntegrationService {
    if (!this._openAIService) {
      const provider = this._registry.get<IOpenAIPlugin>(OPENAI_PLUGIN);
      const credentials = this._registry.get<ICredentialService>(CREDENTIAL_SERVICE);
      this._openAIService = new OpenAIIntegrationService(credentials, provider);
    }
    return this._openAIService;
  }
}
