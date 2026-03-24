export type AnthropicModelActionMode = 'chat_completion' | 'generate_variables';

export interface AnthropicCredentialMaterial {
  apiKey: string;
}

export interface AnthropicModelInfo {
  id: string;
}

export interface AnthropicChatCompletionInput {
  credential: AnthropicCredentialMaterial;
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AnthropicChatCompletionOutput {
  id: string;
  model: string;
  content: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

export interface AnthropicPreviewPayload {
  orgId: string;
  credentialId: string;
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface VariableToExtract {
  name: string;
  description?: string;
  type?: 'string' | 'number' | 'boolean';
}

export interface GenerateVariablesPayload {
  orgId: string;
  credentialId: string;
  model: string;
  prompt: string;
  variablesToExtract: VariableToExtract[];
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateVariablesResult {
  variables: Record<string, unknown>;
  model: string;
}

export interface AskAnthropicPayload {
  orgId: string;
  credentialId: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AskAnthropicResult {
  response: string;
  model: string;
}

export interface ExecuteAnthropicNodePayload {
  orgId: string;
  credentialId: string;
  mode: '' | 'chat_completion' | 'generate_variables';
  model: string;
  prompt?: string;
  messages?: { role: string; content?: string; dialogueVariableId?: string; startsBy?: 'user' | 'assistant' }[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  variablesToExtract?: { name: string; description?: string; type?: string }[];
}

export interface ExecuteAnthropicNodeResult {
  content: string;
  model: string;
  outputType: 'text';
}

export interface AnthropicTestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}
