export interface ElevenLabsCredentialMaterial {
  apiKey: string;
  baseUrl?: string;
}

export interface ElevenLabsModelInfo {
  id: string;
  name?: string;
}

export interface ElevenLabsVoiceInfo {
  id: string;
  name: string;
  category?: string;
}

export interface ElevenLabsTestResult {
  ok: boolean;
  latencyMs: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ElevenLabsSpeechResult {
  audioUrl: string;
  mimeType: string;
  voiceId: string;
  modelId?: string;
}

export interface IElevenLabsProvider {
  testConnection(input: {
    credential: ElevenLabsCredentialMaterial;
    timeoutMs?: number;
  }): Promise<ElevenLabsTestResult>;

  listModels(input: {
    credential: ElevenLabsCredentialMaterial;
    timeoutMs?: number;
  }): Promise<ElevenLabsModelInfo[]>;

  listVoices(input: {
    credential: ElevenLabsCredentialMaterial;
    timeoutMs?: number;
  }): Promise<ElevenLabsVoiceInfo[]>;

  createSpeech(input: {
    credential: ElevenLabsCredentialMaterial;
    voiceId: string;
    text: string;
    modelId?: string;
    outputFormat?: string;
    timeoutMs?: number;
  }): Promise<{
    audioBuffer: Buffer;
    mimeType: string;
    voiceId: string;
    modelId?: string;
  }>;
}

export interface ExecuteElevenLabsNodePayload {
  orgId: string;
  credentialId: string;
  voiceId: string;
  text: string;
  modelId?: string;
  outputFormat?: string;
  timeoutMs?: number;
}

export interface ExecuteElevenLabsNodeResult {
  audioUrl: string;
  mimeType: string;
  voiceId: string;
  modelId?: string;
}

export interface IElevenLabsIntegrationService {
  testCredential(orgId: string, credentialId: string): Promise<ElevenLabsTestResult>;
  listModels(orgId: string, credentialId: string): Promise<ElevenLabsModelInfo[]>;
  listVoices(orgId: string, credentialId: string): Promise<ElevenLabsVoiceInfo[]>;
  executeNode(input: ExecuteElevenLabsNodePayload): Promise<ExecuteElevenLabsNodeResult>;
}
