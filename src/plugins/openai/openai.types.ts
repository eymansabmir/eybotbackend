export interface OpenAICredentialMaterial {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
}

export type OpenAIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAIMessage {
  role: OpenAIMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface OpenAIModelInfo {
  id: string;
  ownedBy?: string;
}

export type OpenAIModelActionMode = 'agent';

export type OpenAIVoiceActionMode = 'create_speech' | 'create_transcription';

export interface OpenAISpeechModelInfo extends OpenAIModelInfo {
  mode: OpenAIVoiceActionMode;
}

export interface OpenAITestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

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

export interface IOpenAIProvider {
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
}

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

export interface ExecuteOpenAINodePayload {
  orgId: string;
  credentialId: string;
  model: string;
  mode: 'agent' | 'voice';
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
}

export interface ExecuteOpenAINodeResult {
  content: string;
  model: string;
  outputType: 'text' | 'audio';
  mimeType?: string;
}

export interface ListSpeechModelsPayload {
  orgId: string;
  credentialId: string;
  actionMode?: OpenAIVoiceActionMode;
  timeoutMs?: number;
}

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

export interface IOpenAIIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<OpenAITestResult>;
  listModels(orgId: string, credentialId: string, actionMode?: OpenAIModelActionMode): Promise<OpenAIModelInfo[]>;
  listSpeechModels(input: ListSpeechModelsPayload): Promise<OpenAISpeechModelInfo[]>;
  preview(input: OpenAIPreviewPayload): Promise<OpenAIChatCompletionOutput>;
  createSpeech(input: CreateSpeechPayload): Promise<CreateSpeechResult>;
  createTranscription(input: CreateTranscriptionPayload): Promise<CreateTranscriptionResult>;
  executeNode(input: ExecuteOpenAINodePayload): Promise<ExecuteOpenAINodeResult>;
}
