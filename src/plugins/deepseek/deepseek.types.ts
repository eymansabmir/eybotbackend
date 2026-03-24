export interface DeepSeekCredentialMaterial {
  apiKey: string;
}

export interface DeepSeekModelInfo {
  id: string;
  name: string;
}

export type DeepSeekMessageParam = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export interface DeepSeekChatCompletionInput {
  credential: DeepSeekCredentialMaterial;
  model: string;
  messages: DeepSeekMessageParam[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface DeepSeekChatCompletionOutput {
  id: string;
  model: string;
  content: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

export interface DeepSeekTestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface VariableToExtract {
  name: string;
  type?: string;
  description?: string;
}

export interface ExecuteDeepSeekNodePayload {
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
  variablesToExtract?: VariableToExtract[];
}

export interface ExecuteDeepSeekNodeResult {
  content?: string;
  model?: string;
  error?: string;
  outputType: 'text' | 'error';
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

export interface DeepSeekPreviewPayload {
  orgId: string;
  credentialId: string;
  model: string;
  messages: DeepSeekMessageParam[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}
