import type { IPlugin } from '../plugin.interface';

export const VOICE_PROVIDERS_PLUGIN = 'voice-providers' as const;

export interface ExecuteVoiceProviderInput {
  userId?: string;
  phone?: string;
  attributes: Record<string, unknown>;
  agentId: string;
  config?: Record<string, unknown>;
}

export interface VoiceProviderAdapter {
  name: string;
  initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string }>;
}

export interface IVoiceProvidersPlugin extends IPlugin {
  get(providerName: string): VoiceProviderAdapter;
}
