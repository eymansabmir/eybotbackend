// ── Credential ────────────────────────────────────────────────────────────
export interface OpenAICredentialMaterial {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
}

// ── Messages ──────────────────────────────────────────────────────────────
export type OpenAIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAIMessage {
  role: OpenAIMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

// ── Models ────────────────────────────────────────────────────────────────
export interface OpenAIModelInfo {
  id: string;
  ownedBy?: string;
}

export type OpenAIModelActionMode = 'chat_completion' | 'assistant' | 'generate_variables' | 'image';

export type OpenAIVoiceActionMode = 'create_speech' | 'create_transcription';

export interface OpenAISpeechModelInfo extends OpenAIModelInfo {
  mode: OpenAIVoiceActionMode;
}

// ── Test ──────────────────────────────────────────────────────────────────
export interface OpenAITestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

// ── Chat Completion ───────────────────────────────────────────────────────
export interface OpenAIChatCompletionInput {
  credential: OpenAICredentialMaterial;
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeoutMs?: number;
  metadata?: Record<string, string>;
}

export interface OpenAIChatCompletionOutput {
  id: string;
  model: string;
  content: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  raw?: unknown;
}

// ── Assistants API ────────────────────────────────────────────────────────
export interface OpenAIAssistantInfo {
  id: string;
  name: string | null;
  model: string;
}

export interface OpenAIThreadInfo {
  id: string;
}

export interface OpenAIToolCall {
  id: string;
  functionName: string;
  arguments: string;
}

export interface OpenAIRunInfo {
  id: string;
  status: string;
  requiredAction?: {
    toolCalls: OpenAIToolCall[];
  };
}

export interface OpenAIThreadMessage {
  role: string;
  content: string;
}

// ── Generate Variables ────────────────────────────────────────────────────
export interface VariableToExtract {
  name: string;
  description?: string;
  type?: 'string' | 'number' | 'boolean';
}

// ── Image Generation ──────────────────────────────────────────────────────
export interface OpenAIImageResult {
  url: string;
  revisedPrompt?: string;
}

// ── Provider interface (low-level HTTP client) ────────────────────────────
export interface IOpenAIProvider {
  // Existing
  testConnection(input: {
    credential: OpenAICredentialMaterial;
    timeoutMs?: number;
  }): Promise<OpenAITestResult>;

  listModels(input: {
    credential: OpenAICredentialMaterial;
    actionMode?: OpenAIModelActionMode;
    timeoutMs?: number;
  }): Promise<OpenAIModelInfo[]>;

  createChatCompletion(input: OpenAIChatCompletionInput): Promise<OpenAIChatCompletionOutput>;

  listSpeechModels(input: {
    credential: OpenAICredentialMaterial;
    actionMode?: OpenAIVoiceActionMode;
    timeoutMs?: number;
  }): Promise<OpenAISpeechModelInfo[]>;

  createSpeech(input: {
    credential: OpenAICredentialMaterial;
    model: string;
    voice: string;
    input: string;
    format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
    speed?: number;
    timeoutMs?: number;
  }): Promise<{
    audioBuffer: Buffer;
    mimeType: string;
    model: string;
    voice: string;
  }>;

  createTranscription(input: {
    credential: OpenAICredentialMaterial;
    model: string;
    audioBuffer: Buffer;
    fileName: string;
    mimeType: string;
    language?: string;
    prompt?: string;
    timeoutMs?: number;
  }): Promise<{
    text: string;
    model: string;
    durationSeconds?: number;
    raw?: unknown;
  }>;

  // ── New: Assistants API ──
  listAssistants(input: {
    credential: OpenAICredentialMaterial;
    limit?: number;
    timeoutMs?: number;
  }): Promise<OpenAIAssistantInfo[]>;

  createThread(input: {
    credential: OpenAICredentialMaterial;
    timeoutMs?: number;
  }): Promise<OpenAIThreadInfo>;

  createThreadMessage(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    role: 'user' | 'assistant';
    content: string;
    timeoutMs?: number;
  }): Promise<void>;

  createRun(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    assistantId: string;
    additionalInstructions?: string;
    timeoutMs?: number;
  }): Promise<OpenAIRunInfo>;

  retrieveRun(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    runId: string;
    timeoutMs?: number;
  }): Promise<OpenAIRunInfo>;

  submitToolOutputs(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    runId: string;
    toolOutputs: { tool_call_id: string; output: string }[];
    timeoutMs?: number;
  }): Promise<OpenAIRunInfo>;

  listMessages(input: {
    credential: OpenAICredentialMaterial;
    threadId: string;
    limit?: number;
    timeoutMs?: number;
  }): Promise<OpenAIThreadMessage[]>;

  // ── New: JSON / Structured Completion ──
  createJsonCompletion(input: {
    credential: OpenAICredentialMaterial;
    model: string;
    messages: OpenAIMessage[];
    jsonSchema: Record<string, unknown>;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<{ parsed: Record<string, unknown>; model: string; raw?: unknown }>;

  // ── New: Image Generation ──
  createImage(input: {
    credential: OpenAICredentialMaterial;
    model?: string;
    prompt: string;
    size?: string;
    quality?: string;
    n?: number;
    timeoutMs?: number;
  }): Promise<OpenAIImageResult[]>;
}

// ── Service payloads ──────────────────────────────────────────────────────

/** Preview (chat completion without engine context) */
export interface OpenAIPreviewPayload {
  orgId: string;
  credentialId: string;
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeoutMs?: number;
}

/** List speech models */
export interface ListSpeechModelsPayload {
  orgId: string;
  credentialId: string;
  actionMode?: OpenAIVoiceActionMode;
  timeoutMs?: number;
}

/** Create speech */
export interface CreateSpeechPayload {
  orgId: string;
  credentialId: string;
  model: string;
  voice: string;
  input: string;
  format?: 'mp3' | 'wav' | 'opus' | 'aac' | 'flac' | 'pcm';
  speed?: number;
  timeoutMs?: number;
}

export interface CreateSpeechResult {
  audioUrl: string;
  mimeType: string;
  model: string;
  voice: string;
}

/** Create transcription */
export interface CreateTranscriptionPayload {
  orgId: string;
  credentialId: string;
  model: string;
  audioBuffer: Buffer;
  fileName: string;
  mimeType: string;
  language?: string;
  prompt?: string;
  timeoutMs?: number;
}

export interface CreateTranscriptionResult {
  text: string;
  model: string;
  durationSeconds?: number;
}

/** Ask Assistant */
export interface AskAssistantPayload {
  orgId: string;
  credentialId: string;
  assistantId: string;
  message: string;
  threadId?: string;
  additionalInstructions?: string;
  functions?: { name: string; code: string }[];
  timeoutMs?: number;
}

export interface AskAssistantResult {
  response: string;
  threadId: string;
  model: string;
}

/** Generate Variables */
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

/** Create Image */
export interface CreateImagePayload {
  orgId: string;
  credentialId: string;
  model?: string;
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  timeoutMs?: number;
}

export interface CreateImageResult {
  imageUrl: string;
  revisedPrompt?: string;
  model: string;
}

/** Engine node execution */
export interface ExecuteOpenAINodePayload {
  orgId: string;
  credentialId: string;
  model: string;
  mode: 'chat_completion' | 'voice' | 'assistant' | 'generate_variables' | 'image';
  voiceAction?: OpenAIVoiceActionMode;
  voice?: string;
  prompt: string;
  audioUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeoutMs?: number;
  // Assistant mode
  assistantId?: string;
  threadId?: string;
  additionalInstructions?: string;
  functions?: { name: string; code: string }[];
  // Generate Variables mode
  variablesToExtract?: VariableToExtract[];
  // Image mode
  imageSize?: string;
  imageQuality?: string;
}

export interface ExecuteOpenAINodeResult {
  content: string;
  model: string;
  outputType: 'text' | 'audio' | 'image';
  mimeType?: string;
  threadId?: string;
  variables?: Record<string, unknown>;
}

// ── Service interface ─────────────────────────────────────────────────────
export interface IOpenAIIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<OpenAITestResult>;
  listModels(orgId: string, credentialId: string, actionMode?: OpenAIModelActionMode): Promise<OpenAIModelInfo[]>;
  listSpeechModels(input: ListSpeechModelsPayload): Promise<OpenAISpeechModelInfo[]>;
  preview(input: OpenAIPreviewPayload): Promise<OpenAIChatCompletionOutput>;
  createSpeech(input: CreateSpeechPayload): Promise<CreateSpeechResult>;
  createTranscription(input: CreateTranscriptionPayload): Promise<CreateTranscriptionResult>;

  // New
  listAssistants(orgId: string, credentialId: string): Promise<OpenAIAssistantInfo[]>;
  askAssistant(input: AskAssistantPayload): Promise<AskAssistantResult>;
  generateVariables(input: GenerateVariablesPayload): Promise<GenerateVariablesResult>;
  createImage(input: CreateImagePayload): Promise<CreateImageResult>;

  executeNode(input: ExecuteOpenAINodePayload): Promise<ExecuteOpenAINodeResult>;
}
