import type { IPlugin, IPluginRegistry } from '../plugin.interface';
import type { IEnginePlugin, ContactInfo, StartFlowInput, ResumeFlowInput, OrchestratorResult } from './engine.interface';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { SessionEntity } from '../../features/session/session.entity';
import { NodeType } from '../../schemas/node-types.enum';
import { CREDENTIAL_SERVICE } from '../../features/repositories.interface';
import type { ICredentialService } from '../../features/credentials';
import type { HttpRequestMappedMutation } from '../http-request';
import { OpenAIIntegrationService } from '../openai';
import { OPENAI_PLUGIN, type IOpenAIPlugin } from '../openai';
import { ElevenLabsIntegrationService } from '../elevenlabs';
import { ELEVENLABS_PLUGIN, type IElevenLabsPlugin } from '../elevenlabs';
import { HttpRequestIntegrationService } from '../http-request';
import { HTTP_REQUEST_PLUGIN, type IHttpRequestPlugin } from '../http-request';
import { STORAGE_PLUGIN, type IStoragePlugin } from '../storage';
import { FlowOrchestrator, type RuntimeIntegrations } from './orchestrator';

export class EnginePlugin implements IPlugin, IEnginePlugin {
  readonly name = 'engine';

  private _registry!: IPluginRegistry;
  private _orchestrator!: FlowOrchestrator;
  private _openAIService?: OpenAIIntegrationService;
  private _elevenLabsService?: ElevenLabsIntegrationService;
  private _httpRequestService?: HttpRequestIntegrationService;

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
        const output = await service.executeNode({
          orgId,
          mode: request.mode,
          voiceAction: request.voiceAction,
          credentialId: request.credentialId,
          model: request.model,
          voice: request.voice,
          prompt: request.prompt,
          audioUrl: request.audioUrl,
          systemPrompt: request.systemPrompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          topP: request.topP,
          frequencyPenalty: request.frequencyPenalty,
          presencePenalty: request.presencePenalty,
          timeoutMs: request.timeoutMs,
          // Assistant mode
          assistantId: request.assistantId,
          threadId: request.threadId,
          additionalInstructions: request.additionalInstructions,
          functions: request.functions,
          // Generate Variables mode
          variablesToExtract: request.variablesToExtract,
          // Image mode
          imageSize: request.imageSize,
          imageQuality: request.imageQuality,
        });

        if (output.outputType === 'audio') {
          return {
            value: output.content,
            message: {
              type: NodeType.SEND_AUDIO,
              payload: { url: output.content },
            },
          };
        }

        if (output.outputType === 'image') {
          return {
            value: output.content,
            message: {
              type: NodeType.SEND_IMAGE,
              payload: { url: output.content },
            },
          };
        }

        return {
          value: output.content,
          message: {
            type: NodeType.SEND_TEXT,
            payload: { message: output.content },
          },
        };
      },
      executeElevenLabs: async ({ orgId, request }) => {
        const service = this.elevenLabsService();
        const output = await service.executeNode({
          orgId,
          credentialId: request.credentialId,
          voiceId: request.voiceId,
          text: request.text,
          modelId: request.modelId,
          outputFormat: request.outputFormat,
          timeoutMs: request.timeoutMs,
        });

        return {
          value: output.audioUrl,
          message: {
            type: NodeType.SEND_AUDIO,
            payload: { url: output.audioUrl },
          },
        };
      },
      executeHttpRequest: async ({ orgId, request }) => {
        const service = this.httpRequestService();
        const output = await service.executeNode({
          orgId,
          url: request.url,
          method: request.method,
          headers: request.headers,
          queryParams: request.queryParams,
          body: request.body,
          timeoutMs: request.timeoutMs,
          credentialId: request.credentialId,
          proxyCredentialsId: request.proxyCredentialsId,
          responseMapping: request.responseMapping,
        });

        return {
          mutations: output.mappedMutations.map((mutation: HttpRequestMappedMutation) => ({
            scope: mutation.scope,
            key: mutation.key,
            value: mutation.value,
          })),
        };
      },
    };
  }

  private openAIService(): OpenAIIntegrationService {
    if (!this._openAIService) {
      const provider = this._registry.get<IOpenAIPlugin>(OPENAI_PLUGIN);
      const credentials = this._registry.get<ICredentialService>(CREDENTIAL_SERVICE);
      const storage = this._registry.get<IStoragePlugin>(STORAGE_PLUGIN);
      this._openAIService = new OpenAIIntegrationService(credentials, provider, storage);
    }
    return this._openAIService;
  }

  private elevenLabsService(): ElevenLabsIntegrationService {
    if (!this._elevenLabsService) {
      const provider = this._registry.get<IElevenLabsPlugin>(ELEVENLABS_PLUGIN);
      const credentials = this._registry.get<ICredentialService>(CREDENTIAL_SERVICE);
      const storage = this._registry.get<IStoragePlugin>(STORAGE_PLUGIN);
      this._elevenLabsService = new ElevenLabsIntegrationService(credentials, provider, storage);
    }
    return this._elevenLabsService;
  }

  private httpRequestService(): HttpRequestIntegrationService {
    if (!this._httpRequestService) {
      const provider = this._registry.get<IHttpRequestPlugin>(HTTP_REQUEST_PLUGIN);
      const credentials = this._registry.get<ICredentialService>(CREDENTIAL_SERVICE);
      this._httpRequestService = new HttpRequestIntegrationService(credentials, provider);
    }
    return this._httpRequestService;
  }
}
