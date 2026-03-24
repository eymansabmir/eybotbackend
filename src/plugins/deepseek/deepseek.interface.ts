import type { IPlugin } from '../plugin.interface';
import type {
  DeepSeekCredentialMaterial,
  DeepSeekModelInfo,
  DeepSeekTestResult,
  DeepSeekChatCompletionInput,
  DeepSeekChatCompletionOutput,
  DeepSeekPreviewPayload,
  ExecuteDeepSeekNodePayload,
  ExecuteDeepSeekNodeResult,
  GenerateVariablesPayload,
  GenerateVariablesResult,
} from './deepseek.types';

export interface IDeepSeekPlugin extends IPlugin {
  testConnection(input: { credential: DeepSeekCredentialMaterial; timeoutMs?: number }): Promise<DeepSeekTestResult>;
  listModels(input: { credential: DeepSeekCredentialMaterial; timeoutMs?: number }): Promise<DeepSeekModelInfo[]>;
  createChatCompletion(input: DeepSeekChatCompletionInput): Promise<DeepSeekChatCompletionOutput>;
}

export interface IDeepSeekIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<DeepSeekTestResult>;
  listModels(): Promise<DeepSeekModelInfo[]>;
  preview(input: DeepSeekPreviewPayload): Promise<DeepSeekChatCompletionOutput>;
  generateVariables(input: GenerateVariablesPayload): Promise<GenerateVariablesResult>;
  executeNode(input: ExecuteDeepSeekNodePayload): Promise<ExecuteDeepSeekNodeResult>;
}
