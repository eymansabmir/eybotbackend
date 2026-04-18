import type { IPlugin } from '../plugin.interface';

export const VOICE_PROVIDERS_PLUGIN = 'voice-providers' as const;

export type VoiceCallTransport = 'telephony' | 'whatsapp';
export type VoiceDispatchMode = 'single' | 'batch';

export interface VoiceCallRecipient {
  phoneE164?: string;
  whatsappUserId?: string;
  attributes?: Record<string, unknown>;
}

export interface VoiceBatchOptions {
  callName?: string;
  scheduledTimeUnix?: number;
  timezone?: string;
  targetConcurrencyLimit?: number;
}

export interface VoiceExecutionRequest {
  mode: VoiceDispatchMode;
  transport: VoiceCallTransport;
  recipient?: VoiceCallRecipient;
  recipients?: VoiceCallRecipient[];
  batch?: VoiceBatchOptions;
}

export interface ExecuteVoiceProviderInput {
  // Required across providers
  provider: string;
  tenantId: string;
  userId?: string;
  phone?: string;
  attributes: Record<string, unknown>;
  agentId: string;

  // Legacy/general config (kept for compatibility)
  config?: Record<string, unknown>;

  // Provider-level execution params and ids (e.g., phone number ids, template names)
  providerConfig?: Record<string, unknown>;

  // Normalized execution shape for transport/mode selection.
  request?: VoiceExecutionRequest;
}

export interface VoiceProviderAdapter {
  name: string;
  initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string; message?: string }>;
}

export interface IVoiceProvidersPlugin extends IPlugin {
  get(providerName: string): VoiceProviderAdapter;
}
