import { CredentialType } from '@prisma/client';
import { AppError, ValidationError } from '../../utils/errors';
import type { ICredentialService } from '../../features/credentials';
import type { IAnthropicIntegrationService, IAnthropicPlugin } from './anthropic.interface';
import {
  AnthropicModelInfo,
  AnthropicTestResult,
  ExecuteAnthropicNodePayload,
  ExecuteAnthropicNodeResult,
  GenerateVariablesPayload,
  GenerateVariablesResult,
  AnthropicPreviewPayload,
  AnthropicChatCompletionOutput,
  AnthropicCredentialMaterial,
  VariableToExtract,
} from './anthropic.types';

export class AnthropicIntegrationService implements IAnthropicIntegrationService {
  constructor(
    private readonly credentials: ICredentialService,
    private readonly provider: IAnthropicPlugin,
  ) {}

  async testCredential(orgId: string, credentialId: string): Promise<AnthropicTestResult> {
    const material = await this.getCredentialMaterial(orgId, credentialId);
    const result = await this.provider.testConnection({ credential: material });

    if (result.ok) {
      await this.credentials.markTested(orgId, credentialId);
    }

    return result;
  }

  async listModels(): Promise<AnthropicModelInfo[]> {
    return this.provider.listModels();
  }

  async preview(input: AnthropicPreviewPayload): Promise<AnthropicChatCompletionOutput> {
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      return await this.provider.createChatCompletion({
        credential: material,
        model: input.model,
        messages: input.messages,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
      });
    } catch (error) {
      throw this.toPublicError(error);
    }
  }

  async generateVariables(input: GenerateVariablesPayload): Promise<GenerateVariablesResult> {
    const startedAt = Date.now();
    try {
      const material = await this.getCredentialMaterial(input.orgId, input.credentialId);

      const jsonSchema = this.buildExtractionSchema(input.variablesToExtract);
      const systemPrompt = `Extract the requested information from the user message. Respond with ONLY a valid JSON object matching this schema, no other text:\n${JSON.stringify(jsonSchema)}`;

      const messages = [
        { role: 'user' as const, content: input.prompt },
      ];

      const result = await this.provider.createChatCompletion({
        credential: material,
        model: input.model,
        messages,
        systemPrompt,
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
      });

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(result.content);
      } catch (err) {
        throw new AppError('Anthropic response was not valid JSON', 502);
      }

      logger.info(
        {
          operation: 'anthropic.generate_variables',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: result.model,
          latencyMs: Date.now() - startedAt,
          variableCount: input.variablesToExtract.length,
        },
        'Anthropic generate variables completed',
      );

      return {
        variables: parsed,
        model: result.model,
      };
    } catch (error) {
      logger.warn(
        {
          operation: 'anthropic.generate_variables',
          orgId: input.orgId,
          credentialId: input.credentialId,
          model: input.model,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        },
        'Anthropic generate variables failed',
      );
      throw this.toPublicError(error);
    }
  }

  async executeNode(input: ExecuteAnthropicNodePayload): Promise<ExecuteAnthropicNodeResult> {
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
    
    // Convert dynamic messages or single prompt string to Chat Completion format for Anthropic Node 
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

  private async getCredentialMaterial(orgId: string, credentialId: string): Promise<AnthropicCredentialMaterial> {
    let material: Partial<AnthropicCredentialMaterial>;
    try {
      material = (await this.credentials.decryptSecret(
        orgId,
        credentialId,
        CredentialType.ANTHROPIC,
      )) as Partial<AnthropicCredentialMaterial>;
    } catch (err) {
      throw new AppError('Anthropic credential not found, invalid, or decryption failed', 404);
    }

    if (!material.apiKey) {
      throw new AppError('Anthropic API key is missing from credential', 400);
    }
    return material as AnthropicCredentialMaterial;
  }

  private toPublicError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof Error) return new AppError(error.message, 500);
    return new AppError('An unexpected error occurred with Anthropic', 500);
  }

  private buildExtractionSchema(variables: { name: string; type?: string; description?: string }[]): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const v of variables) {
      const typeStr = v.type ?? 'string';
      const prop: Record<string, unknown> = { type: typeStr };
      if (v.description) {
        prop.description = v.description;
      }
      properties[v.name] = prop;
      required.push(v.name);
    }

    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }
}
