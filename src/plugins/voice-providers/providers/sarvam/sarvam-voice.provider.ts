import type { ExecuteVoiceProviderInput, VoiceProviderAdapter } from '../../voice-providers.interface';
import { logger } from '../../../../utils/logger';

export class SarvamVoiceProviderAdapter implements VoiceProviderAdapter {
  readonly name = 'sarvam';

  async initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string }> {
    logger.info({ provider: this.name, agentId: input.agentId }, 'Voice provider call accepted');
    return { accepted: true };
  }
}
