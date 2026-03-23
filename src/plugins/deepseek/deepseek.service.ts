import { CredentialType } from '@prisma/client';
import type { IDeepSeekPlugin, IDeepSeekIntegrationService } from './deepseek.interface';
import {
  DeepSeekCredentialMaterial,
  DeepSeekTestResult,
  DeepSeekModelInfo,
  ExecuteDeepSeekNodePayload,
  ExecuteDeepSeekNodeResult,
  GenerateVariablesPayload,
  GenerateVariablesResult,
  DeepSeekPreviewPayload,
  DeepSeekChatCompletionOutput,
  VariableToExtract,
} from './deepseek.types';
import type { ICredentialService } from '../../features/credentials';
import { AppError, ValidationError } from '../../utils/errors';

export class DeepSeekIntegrationService implements IDeepSeekIntegrationService {
  constructor(
    private readonly provider: IDeepSeekPlugin,
    private readonly credentialService: ICredentialService,
  ) {}

  private async getCredentialMaterial(orgId: string, credentialId: string): Promise<DeepSeekCredentialMaterial> {
    const cred = await this.credentialService.getCredential(orgId, credentialId);
    if (!cred || cred.type !== CredentialType.DEEPSEEK) {
      throw new ValidationError(`Credential ${credentialId} not found or not a deepseek type`);
    }
    const secretObj = await this.credentialService.decryptSecret(orgId, credentialId, CredentialType.DEEPSEEK);
    const apiKey = secretObj.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
      throw new AppError('DeepSeek API Key is missing or invalid in credential', 500);
    }
    return { apiKey };
  }

  async testCredential(orgId: string, credentialId: string): Promise<DeepSeekTestResult> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    return this.provider.testConnection({ credential: material, timeoutMs: 15_000 });
  }

  async listModels(): Promise<DeepSeekModelInfo[]> {
    return this.provider.listModels({ credential: { apiKey: 'dummy' } }); // Models list is static
  }

  async preview(input: DeepSeekPreviewPayload): Promise<DeepSeekChatCompletionOutput> {
    const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

    return this.provider.createChatCompletion({
      credential: material,
      model: input.model,
      messages: input.messages,
      systemPrompt: input.systemPrompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    });
  }

  async generateVariables(input: GenerateVariablesPayload): Promise<GenerateVariablesResult> {
    const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

    const schemaObj = (input.variablesToExtract || []).reduce(
      (acc, v) => {
        acc[v.name] = { type: v.type || 'string', description: v.description };
        return acc;
      },
      {} as Record<string, any>,
    );

    const systemPrompt = `You are a strict data extraction assistant. You must extract information from the user's message and return ONLY a valid JSON object matching the requested schema. Do not include markdown blocks, explanations, or text outside the JSON. \n\nSchema:\n${JSON.stringify(schemaObj, null, 2)}`;

    const response = await this.provider.createChatCompletion({
      credential: material,
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      systemPrompt,
      temperature: input.temperature ?? 0.1, // Low temp for extraction
      timeoutMs: input.timeoutMs,
    });

    let variables: Record<string, unknown>;
    try {
      let rawJson = response.content.trim();
      if (rawJson.startsWith('```json')) {
        rawJson = rawJson.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (rawJson.startsWith('```')) {
        rawJson = rawJson.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      variables = JSON.parse(rawJson);
    } catch {
      variables = { _raw: response.content };
    }

    return { variables, model: response.model };
  }

  async executeNode(input: ExecuteDeepSeekNodePayload): Promise<ExecuteDeepSeekNodeResult> {
    if (input.mode === 'generate_variables') {
      if (!input.variablesToExtract || input.variablesToExtract.length === 0) {
        throw new ValidationError('variablesToExtract is required for generate_variables mode');
      }

      const result = await this.generateVariables({
        orgId: input.orgId,
        credentialId: input.credentialId,
        model: input.model,
        prompt: input.prompt || '',
        variablesToExtract: input.variablesToExtract as VariableToExtract[],
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      });

      return {
        content: JSON.stringify(result.variables),
        model: result.model,
        outputType: 'text',
      };
    }

    // Chat completion mode by default
    const material = await this.getCredentialMaterial(input.orgId, input.credentialId);
    
    // Convert dynamic messages or single prompt string to Chat Completion format for DeepSeek Node 
    const messages = input.messages && input.messages.length > 0
      ? input.messages.map(m => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content: m.content || ''
        }))
      : [{ role: 'user' as const, content: input.prompt || '' }];

    const result = await this.provider.createChatCompletion({
      credential: material,
      model: input.model,
      messages,
      systemPrompt: input.systemPrompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      timeoutMs: input.timeoutMs,
    });

    return {
      content: result.content,
      model: result.model,
      outputType: 'text',
    };
  }
}
