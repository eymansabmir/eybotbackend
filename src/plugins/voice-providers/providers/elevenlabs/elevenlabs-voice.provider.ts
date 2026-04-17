import type { ExecuteVoiceProviderInput, VoiceProviderAdapter } from '../../voice-providers.interface';
import { logger } from '../../../../utils/logger';

export class ElevenLabsVoiceProviderAdapter implements VoiceProviderAdapter {
  readonly name = 'elevenlabs';

  private formatPhone(phone?: string): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  async initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string }> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      logger.error({ provider: this.name }, 'ElevenLabs API Key is missing in environment variables');
      return { accepted: false };
    }

    const phone = this.formatPhone(input.phone);
    if (!phone) {
       logger.error({ provider: this.name }, 'No phone number provided for outbound call');
       return { accepted: false };
    }

    const url = `https://api.elevenlabs.io/v1/convai/agents/${input.agentId}/initiate-call`;

    try {
      logger.info({ 
        provider: this.name, 
        agentId: input.agentId, 
        phone 
      }, 'Initiating ElevenLabs outbound call');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phone,
          dynamic_variables: input.attributes, // Pass all orchestrator attributes as dynamic vars
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error({ 
            provider: this.name, 
            status: response.status, 
            error: errorData 
        }, 'ElevenLabs API request failed');
        return { accepted: false };
      }

      const result = await response.json();
      logger.info({ 
        provider: this.name, 
        callId: result.conversation_id 
      }, 'ElevenLabs outbound call initiated successfully');

      return { 
        accepted: true, 
        providerReference: result.conversation_id 
      };
    } catch (err) {
      logger.error({ provider: this.name, err }, 'Failed to connect to ElevenLabs API');
      return { accepted: false };
    }
  }
}
