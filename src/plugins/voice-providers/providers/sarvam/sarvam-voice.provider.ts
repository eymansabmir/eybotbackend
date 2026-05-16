import type { ExecuteVoiceProviderInput, VoiceCallRecipient, VoiceProviderAdapter } from '../../voice-providers.interface';
import { logger } from '../../../../utils/logger';

export class SarvamVoiceProviderAdapter implements VoiceProviderAdapter {
  readonly name = 'sarvam';

  private formatPhone(phone?: string): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  private resolveApiKey(input: ExecuteVoiceProviderInput): string | undefined {
    const key = input.providerConfig?.['apiKey'];
    if (typeof key === 'string' && key.trim().length > 0) {
      return key;
    }
    return process.env.SARVAM_API_KEY;
  }

  private resolveBaseUrl(input: ExecuteVoiceProviderInput): string | undefined {
    const override = input.providerConfig?.['orchestratorBaseUrl'];
    if (typeof override === 'string' && override.trim().length > 0) {
      return override.replace(/\/{1,10}$/, '');
    }
    if (typeof process.env.SARVAM_VOICE_ORCHESTRATOR_URL === 'string' && process.env.SARVAM_VOICE_ORCHESTRATOR_URL.trim().length > 0) {
      return process.env.SARVAM_VOICE_ORCHESTRATOR_URL.replace(/\/{1,10}$/, '');
    }
    return undefined;
  }

  private resolveEndpoint(input: ExecuteVoiceProviderInput, key: string, fallback: string): string {
    const override = input.providerConfig?.[key];
    if (typeof override === 'string' && override.trim().length > 0) {
      return override.startsWith('/') ? override : `/${override}`;
    }
    return fallback;
  }

  private resolveSingleRecipient(input: ExecuteVoiceProviderInput): VoiceCallRecipient {
    if (input.request?.recipient) {
      return input.request.recipient;
    }

    return {
      phoneE164: input.phone,
      attributes: input.attributes,
    };
  }

  private buildSessionConfig(input: ExecuteVoiceProviderInput): Record<string, unknown> {
    return {
      stt: {
        provider: 'sarvam',
        model: typeof input.providerConfig?.['sttModel'] === 'string' ? input.providerConfig['sttModel'] : 'saaras:v3',
        language: typeof input.providerConfig?.['language'] === 'string' ? input.providerConfig['language'] : 'unknown',
        mode: input.providerConfig?.['sttMode'] === 'translate' ? 'translate' : 'transcribe',
        flush_signal: true,
      },
      tts: {
        provider: 'sarvam',
        model: typeof input.providerConfig?.['ttsModel'] === 'string' ? input.providerConfig['ttsModel'] : 'bulbul:v3',
        target_language_code:
          typeof input.providerConfig?.['targetLanguageCode'] === 'string'
            ? input.providerConfig['targetLanguageCode']
            : 'en-IN',
        speaker: typeof input.providerConfig?.['speaker'] === 'string' ? input.providerConfig['speaker'] : 'shubh',
      },
      llm: {
        provider: 'openai',
        model: typeof input.providerConfig?.['llmModel'] === 'string' ? input.providerConfig['llmModel'] : 'gpt-4o',
      },
      turn_detection: 'stt',
      min_endpointing_delay: 0.07,
      livekit: {
        url:
          typeof input.providerConfig?.['livekitUrl'] === 'string'
            ? input.providerConfig['livekitUrl']
            : process.env.LIVEKIT_URL,
        api_key:
          typeof input.providerConfig?.['livekitApiKey'] === 'string'
            ? input.providerConfig['livekitApiKey']
            : process.env.LIVEKIT_API_KEY,
        api_secret:
          typeof input.providerConfig?.['livekitApiSecret'] === 'string'
            ? input.providerConfig['livekitApiSecret']
            : process.env.LIVEKIT_API_SECRET,
      },
    };
  }

  private async post<T>(baseUrl: string, endpoint: string, apiKey: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Sarvam orchestrator ${endpoint} failed (${response.status}): ${JSON.stringify(errorData)}`);
    }

    return response.json() as Promise<T>;
  }

  async initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string; message?: string }> {
    const apiKey = this.resolveApiKey(input);
    if (!apiKey) {
      return { accepted: false, message: 'Missing Sarvam API key' };
    }

    const baseUrl = this.resolveBaseUrl(input);
    if (!baseUrl) {
      return {
        accepted: false,
        message: 'Missing Sarvam orchestrator URL. Set providerConfig.orchestratorBaseUrl or SARVAM_VOICE_ORCHESTRATOR_URL',
      };
    }

    const mode = input.request?.mode ?? 'single';
    const transport = input.request?.transport ?? 'telephony';

    logger.info(
      { provider: this.name, agentId: input.agentId, mode, transport },
      'Initiating Sarvam outbound execution',
    );

    try {
      if (mode === 'single') {
        const recipient = this.resolveSingleRecipient(input);

        if (transport === 'telephony') {
          const phone = this.formatPhone(recipient.phoneE164);
          if (!phone) {
            return { accepted: false, message: 'Missing recipient phone number (E.164)' };
          }

          const result = await this.post<{ accepted?: boolean; id?: string; reference?: string; message?: string }>(
            baseUrl,
            this.resolveEndpoint(input, 'telephonyEndpoint', '/v1/voice/telephony/outbound-call'),
            apiKey,
            {
              channel: 'telephony',
              agent_id: input.agentId,
              recipient: { phone_e164: phone },
              session: this.buildSessionConfig(input),
              metadata: {
                tenant_id: input.tenantId,
                user_id: input.userId,
                attributes: recipient.attributes ?? input.attributes,
              },
            },
          );

          return {
            accepted: result.accepted ?? Boolean(result.id || result.reference),
            providerReference: result.id ?? result.reference,
            message: result.message,
          };
        }

        const whatsappUserId = recipient.whatsappUserId ?? input.userId;
        if (!whatsappUserId) {
          return { accepted: false, message: 'Missing WhatsApp user ID for Sarvam WhatsApp call' };
        }

        const result = await this.post<{ accepted?: boolean; id?: string; reference?: string; message?: string }>(
          baseUrl,
          this.resolveEndpoint(input, 'whatsappEndpoint', '/v1/voice/whatsapp/outbound-call'),
          apiKey,
          {
            channel: 'whatsapp',
            agent_id: input.agentId,
            recipient: { whatsapp_user_id: whatsappUserId },
            session: this.buildSessionConfig(input),
            metadata: {
              tenant_id: input.tenantId,
              user_id: input.userId,
              attributes: recipient.attributes ?? input.attributes,
            },
          },
        );

        return {
          accepted: result.accepted ?? Boolean(result.id || result.reference),
          providerReference: result.id ?? result.reference,
          message: result.message,
        };
      }

      const recipients = input.request?.recipients ?? [];
      if (recipients.length === 0) {
        return { accepted: false, message: 'Batch mode requires at least one recipient' };
      }

      const normalizedRecipients = recipients.map((recipient) => {
        if (transport === 'whatsapp') {
          return {
            whatsapp_user_id: recipient.whatsappUserId,
            metadata: recipient.attributes ?? input.attributes,
          };
        }

        return {
          phone_e164: this.formatPhone(recipient.phoneE164),
          metadata: recipient.attributes ?? input.attributes,
        };
      });

      const result = await this.post<{ accepted?: boolean; id?: string; reference?: string; message?: string }>(
        baseUrl,
        this.resolveEndpoint(input, 'batchEndpoint', '/v1/voice/batch-calling/submit'),
        apiKey,
        {
          channel: transport,
          agent_id: input.agentId,
          recipients: normalizedRecipients,
          batch: {
            name: input.request?.batch?.callName ?? `sarvam_batch_${Date.now()}`,
            scheduled_time_unix: input.request?.batch?.scheduledTimeUnix,
            timezone: input.request?.batch?.timezone,
            target_concurrency_limit: input.request?.batch?.targetConcurrencyLimit,
          },
          session: this.buildSessionConfig(input),
          metadata: {
            tenant_id: input.tenantId,
            user_id: input.userId,
          },
        },
      );

      return {
        accepted: result.accepted ?? Boolean(result.id || result.reference),
        providerReference: result.id ?? result.reference,
        message: result.message,
      };
    } catch (err) {
      logger.error({ provider: this.name, err }, 'Failed to connect to Sarvam orchestrator');
      return { accepted: false, message: err instanceof Error ? err.message : 'Unknown Sarvam error' };
    }
  }
}
