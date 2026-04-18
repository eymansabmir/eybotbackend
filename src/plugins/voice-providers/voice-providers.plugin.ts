import type { IPluginRegistry } from '../plugin.interface';
import type { ExecuteVoiceProviderInput, IVoiceProvidersPlugin, VoiceProviderAdapter } from './voice-providers.interface';
import { ElevenLabsVoiceProviderAdapter } from './providers/elevenlabs/elevenlabs-voice.provider';
import { SarvamVoiceProviderAdapter } from './providers/sarvam/sarvam-voice.provider';
import { VapiVoiceProviderAdapter } from './providers/vapi/vapi-voice.provider';

export class VoiceProvidersPlugin implements IVoiceProvidersPlugin {
  readonly name = 'voice-providers';
  private readonly providers = new Map<string, VoiceProviderAdapter>();

  async initialize(_registry: IPluginRegistry): Promise<void> {
    this.register(new ElevenLabsVoiceProviderAdapter());
    this.register(new SarvamVoiceProviderAdapter());
    this.register(new VapiVoiceProviderAdapter());
    logger.info({ count: this.providers.size }, 'VoiceProvidersPlugin: providers ready');
  }

  async shutdown(): Promise<void> {
    this.providers.clear();
  }

  register(provider: VoiceProviderAdapter): void {
    this.providers.set(provider.name, provider);
  }

  get(providerName: string): VoiceProviderAdapter {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        name: providerName,
        async initiateCall(_input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; message?: string }> {
          logger.warn({ provider: providerName }, 'Voice provider not registered. Execution accepted without outbound call.');
          return { accepted: false, message: `Provider '${providerName}' is not registered` };
        },
      };
    }

    return provider;
  }
}
