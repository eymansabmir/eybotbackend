import type { IPlugin } from '../plugin.interface';
import type {
  AnthropicChatCompletionInput,
  AnthropicChatCompletionOutput,
  AnthropicCredentialMaterial,
  AnthropicModelInfo,
  AnthropicTestResult,
  ExecuteAnthropicNodePayload,
  ExecuteAnthropicNodeResult,
  GenerateVariablesPayload,
  GenerateVariablesResult,
  AnthropicPreviewPayload,
} from './anthropic.types';

export interface IAnthropicPlugin extends IPlugin {
  testConnection(input: {
    credential: AnthropicCredentialMaterial;
    timeoutMs?: number;
  }): Promise<AnthropicTestResult>;

  listModels(): Promise<AnthropicModelInfo[]>;

  createChatCompletion(input: AnthropicChatCompletionInput): Promise<AnthropicChatCompletionOutput>;
}

export interface IAnthropicIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<AnthropicTestResult>;
  listModels(): Promise<AnthropicModelInfo[]>;
  preview(input: AnthropicPreviewPayload): Promise<AnthropicChatCompletionOutput>;
  generateVariables(input: GenerateVariablesPayload): Promise<GenerateVariablesResult>;
  executeNode(input: ExecuteAnthropicNodePayload): Promise<ExecuteAnthropicNodeResult>;
}
