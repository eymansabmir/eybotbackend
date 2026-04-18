import type { ExecuteVoiceProviderInput, VoiceCallRecipient, VoiceProviderAdapter } from '../../voice-providers.interface';
import { logger } from '../../../../utils/logger';

export class VapiVoiceProviderAdapter implements VoiceProviderAdapter {
  readonly name = 'vapi';

  private resolveApiKey(input: ExecuteVoiceProviderInput): string | undefined {
    const override = input.providerConfig?.['apiKey'];
    if (typeof override === 'string' && override.trim().length > 0) {
      return override;
    }
    return process.env.VAPI_API_KEY;
  }

  private resolveBaseUrl(input: ExecuteVoiceProviderInput): string {
    const override = input.providerConfig?.['baseUrl'];
    if (typeof override === 'string' && override.trim().length > 0) {
      return override.replace(/\/+$/, '');
    }
    return 'https://api.vapi.ai';
  }

  private resolveEndpoint(input: ExecuteVoiceProviderInput, key: string, fallback: string): string {
    const override = input.providerConfig?.[key];
    if (typeof override === 'string' && override.trim().length > 0) {
      return override.startsWith('/') ? override : `/${override}`;
    }
    return fallback;
  }

  private formatPhone(phone?: string): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
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
      throw new Error(`Vapi API ${endpoint} failed (${response.status}): ${JSON.stringify(errorData)}`);
    }

    return response.json() as Promise<T>;
  }

  private buildCommonPayload(input: ExecuteVoiceProviderInput): Record<string, unknown> {
    const phoneNumberId =
      typeof input.providerConfig?.['phoneNumberId'] === 'string'
        ? input.providerConfig['phoneNumberId']
        : undefined;

    const payload: Record<string, unknown> = {
      assistantId: input.agentId,
      assistantOverrides: {
        variableValues: input.attributes,
      },
      metadata: {
        tenantId: input.tenantId,
        userId: input.userId,
      },
    };

    if (phoneNumberId) {
      payload['phoneNumberId'] = phoneNumberId;
    }

    return payload;
  }

  async initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string; message?: string }> {
    const apiKey = this.resolveApiKey(input);
    if (!apiKey) {
      return { accepted: false, message: 'Missing Vapi API key' };
    }

    const mode = input.request?.mode ?? 'single';
    const transport = input.request?.transport ?? 'telephony';
    const baseUrl = this.resolveBaseUrl(input);

    logger.info(
      { provider: this.name, agentId: input.agentId, mode, transport },
      'Initiating Vapi outbound execution',
    );

    const commonPayload = this.buildCommonPayload(input);

    if (mode === 'single') {
      try {
        const recipient = this.resolveSingleRecipient(input);
        const target = transport === 'whatsapp'
          ? (recipient.whatsappUserId ?? input.userId)
          : recipient.phoneE164;

        const formatted = this.formatPhone(target);
        if (!formatted) {
          return {
            accepted: false,
            message: transport === 'whatsapp'
              ? 'Missing WhatsApp user/number for Vapi call'
              : 'Missing recipient phone number (E.164)',
          };
        }

        const endpoint = transport === 'whatsapp'
          ? this.resolveEndpoint(input, 'whatsappEndpoint', '/call')
          : this.resolveEndpoint(input, 'telephonyEndpoint', '/call');

        const result = await this.post<{ id?: string; status?: string; message?: string }>(
          baseUrl,
          endpoint,
          apiKey,
          {
            ...commonPayload,
            customer: {
              number: formatted,
            },
            metadata: {
              ...(commonPayload['metadata'] as Record<string, unknown>),
              transport,
            },
          },
        );

        return {
          accepted: Boolean(result.id),
          providerReference: result.id,
          message: result.message ?? result.status,
        };
      } catch (err) {
        logger.error({ provider: this.name, err }, 'Failed to create Vapi single call');
        return { accepted: false, message: err instanceof Error ? err.message : 'Unknown Vapi error' };
      }
    }

    const recipients = input.request?.recipients ?? [];
    if (recipients.length === 0) {
      return { accepted: false, message: 'Batch mode requires at least one recipient' };
    }

    const endpoint = transport === 'whatsapp'
      ? this.resolveEndpoint(input, 'whatsappEndpoint', '/call')
      : this.resolveEndpoint(input, 'telephonyEndpoint', '/call');
    const intervalMs =
      typeof input.providerConfig?.['batchIntervalMs'] === 'number' && input.providerConfig['batchIntervalMs'] >= 0
        ? input.providerConfig['batchIntervalMs']
        : 250;

    let successCount = 0;
    let failureCount = 0;
    let firstReference: string | undefined;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i]!;
      const target = transport === 'whatsapp' ? recipient.whatsappUserId : recipient.phoneE164;
      const formatted = this.formatPhone(target);
      if (!formatted) {
        failureCount++;
        continue;
      }

      try {
        const response = await this.post<{ id?: string }>(baseUrl, endpoint, apiKey, {
          ...commonPayload,
          customer: {
            number: formatted,
          },
          assistantOverrides: {
            variableValues: recipient.attributes ?? input.attributes,
          },
          metadata: {
            ...(commonPayload['metadata'] as Record<string, unknown>),
            transport,
            batchName: input.request?.batch?.callName,
          },
        });

        if (response.id) {
          successCount++;
          if (!firstReference) {
            firstReference = response.id;
          }
        } else {
          failureCount++;
        }
      } catch (err) {
        failureCount++;
        logger.error({ provider: this.name, err, index: i }, 'Failed to create Vapi call in batch');
      }

      if (intervalMs > 0 && i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    return {
      accepted: successCount > 0,
      providerReference: firstReference,
      message: `Vapi batch completed: success=${successCount}, failed=${failureCount}`,
    };
  }
}
