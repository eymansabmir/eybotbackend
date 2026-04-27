import type { ExecuteVoiceProviderInput, VoiceCallRecipient, VoiceProviderAdapter } from '../../voice-providers.interface';
import { logger } from '../../../../utils/logger';

interface ExotelCallResponse {
  Call?: {
    Sid?: string;
    Status?: string;
  };
}

export class ExotelVoiceProviderAdapter implements VoiceProviderAdapter {
  readonly name = 'exotel';

  private maskPhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return `***${digits}`;
    return `***${digits.slice(-4)}`;
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

  private readSecretField(
    config: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined {
    const direct = config?.[key];
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct.trim();
    }

    const telephonySecret = config?.['telephonySecret'];
    if (telephonySecret && typeof telephonySecret === 'object') {
      const nested = (telephonySecret as Record<string, unknown>)[key];
      if (typeof nested === 'string' && nested.trim().length > 0) {
        return nested.trim();
      }
    }

    return undefined;
  }

  private resolveBaseUrl(input: ExecuteVoiceProviderInput): string {
    const fromConfig = this.readSecretField(input.providerConfig, 'baseUrl');
    if (fromConfig) {
      return fromConfig.replace(/\/+$/, '');
    }
    return 'https://api.exotel.com';
  }

  private resolveWebhookUrl(input: ExecuteVoiceProviderInput): string | undefined {
    const fromConfig = this.readSecretField(input.providerConfig, 'callFlowUrl');
    if (fromConfig) {
      return fromConfig;
    }

    return this.readSecretField(input.providerConfig, 'url');
  }

  private resolveStatusCallbackUrl(input: ExecuteVoiceProviderInput): string | undefined {
    return this.readSecretField(input.providerConfig, 'statusCallbackUrl');
  }

  private resolveCustomField(input: ExecuteVoiceProviderInput): string | undefined {
    const configured = this.readSecretField(input.providerConfig, 'customField');
    if (configured) {
      return configured;
    }

    const recipientId = this.readSecretField(input.providerConfig, 'campaignRecipientId') ?? input.userId;
    if (!recipientId) {
      return undefined;
    }

    return JSON.stringify({
      campaignRecipientId: recipientId,
      tenantId: input.tenantId,
    });
  }

  private async post(
    url: string,
    accountSid: string,
    authToken: string,
    form: URLSearchParams,
  ): Promise<ExotelCallResponse> {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Exotel call failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<ExotelCallResponse>;
  }
  
  async initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string; message?: string }> {
    const traceId = input.traceId;
    const mode = input.request?.mode ?? 'single';
    const transport = input.request?.transport ?? 'telephony';

    if (transport !== 'telephony') {
      logger.warn({ traceId, provider: this.name, transport }, 'Exotel dispatch rejected: unsupported transport');
      return { accepted: false, message: 'Exotel adapter supports telephony transport only' };
    }

    const accountSid = this.readSecretField(input.providerConfig, 'accountSid');
    const authToken = this.readSecretField(input.providerConfig, 'authToken');

    if (!accountSid || !authToken) {
      logger.warn({ traceId, provider: this.name }, 'Exotel dispatch rejected: missing credentials');
      return { accepted: false, message: 'Missing Exotel credentials (accountSid/authToken)' };
    }

    const callerId = this.readSecretField(input.providerConfig, 'callerId');
    const from = this.readSecretField(input.providerConfig, 'from') ?? callerId;
    if (!from) {
      logger.warn({ traceId, provider: this.name }, 'Exotel dispatch rejected: missing caller id');
      return { accepted: false, message: 'Missing Exotel caller id (from/callerId)' };
    }

    const baseUrl = this.resolveBaseUrl(input);
    const endpoint = this.readSecretField(input.providerConfig, 'connectEndpoint')
      ?? `/v1/Accounts/${accountSid}/Calls/connect.json`;

    logger.info(
      { provider: this.name, mode, transport, tenantId: input.tenantId, traceId, step: 'STEP_8_EXOTEL_DISPATCH_START' },
      'Voice orchestration step',
    );

    try {
      if (mode === 'single') {
        const recipient = this.resolveSingleRecipient(input);
        const to = this.formatPhone(recipient.phoneE164);
        if (!to) {
          return { accepted: false, message: 'Missing recipient phone number (E.164)' };
        }

        const form = new URLSearchParams();
        form.set('From', to);
        form.set('CallerId', from);

        const callType = this.readSecretField(input.providerConfig, 'callType');
        if (callType) {
          form.set('CallType', callType);
        }

        const streamUrl = this.resolveWebhookUrl(input);
        if (streamUrl) {
          form.set('StreamUrl', streamUrl);
          form.set('StreamType', 'bidirectional');
        }

        const customField = this.resolveCustomField(input);
        if (customField) {
          form.set('CustomField', customField);
        }

        const statusCallbackUrl = this.resolveStatusCallbackUrl(input);
        if (statusCallbackUrl) {
          form.set('StatusCallback', statusCallbackUrl);
        }

        logger.info(
          {
            flow: 'voice_orchestration',
            step: 'STEP_9_EXOTEL_API_HIT',
            traceId,
            tenantId: input.tenantId,
            provider: this.name,
            mode,
            endpoint: `${baseUrl}${endpoint}`,
            toMasked: this.maskPhone(to),
          },
          'Voice orchestration step',
        );

        /* 
        const result = await this.post(`${baseUrl}${endpoint}`, accountSid, authToken, form);
        const reference = result.Call?.Sid;
        */
        
        // Mock Success Response
        const reference = `mock-exotel-${Date.now()}`;
        const result = { Call: { Sid: reference, Status: 'queued' } };

        logger.info(
          {
            flow: 'voice_orchestration',
            step: 'STEP_10_EXOTEL_API_RESPONSE',
            traceId,
            provider: this.name,
            accepted: Boolean(reference),
            providerReference: reference,
            status: result.Call?.Status,
          },
          'Voice orchestration step',
        );

        return {
          accepted: Boolean(reference),
          providerReference: reference,
          message: result.Call?.Status,
        };
      }

      const recipients = input.request?.recipients ?? [];
      if (recipients.length === 0) {
        return { accepted: false, message: 'Batch mode requires at least one recipient' };
      }

      const intervalMsRaw = this.readSecretField(input.providerConfig, 'batchIntervalMs');
      const intervalMs = intervalMsRaw ? Number(intervalMsRaw) : 250;
      const sleepMs = Number.isFinite(intervalMs) && intervalMs >= 0 ? intervalMs : 250;

      let successCount = 0;
      let failureCount = 0;
      let firstReference: string | undefined;

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i]!;
        const to = this.formatPhone(recipient.phoneE164);
        if (!to) {
          failureCount++;
          continue;
        }

        try {
          const form = new URLSearchParams();
          form.set('From', to);
          form.set('CallerId', from);

          const callType = this.readSecretField(input.providerConfig, 'callType');
          if (callType) {
            form.set('CallType', callType);
          }

          const streamUrl = this.resolveWebhookUrl(input);
          if (streamUrl) {
            form.set('StreamUrl', streamUrl);
            form.set('StreamType', 'bidirectional');
          }

          const customField = this.resolveCustomField({
            ...input,
            userId: recipient.attributes?.['campaignRecipientId'] as string | undefined ?? input.userId,
          });
          if (customField) {
            form.set('CustomField', customField);
          }

          const statusCallbackUrl = this.resolveStatusCallbackUrl(input);
          if (statusCallbackUrl) {
            form.set('StatusCallback', statusCallbackUrl);
          }

          logger.info(
            {
              flow: 'voice_orchestration',
              step: 'STEP_9_EXOTEL_API_HIT',
              traceId,
              tenantId: input.tenantId,
              provider: this.name,
              mode,
              endpoint: `${baseUrl}${endpoint}`,
              toMasked: this.maskPhone(to),
              batchIndex: i,
            },
            'Voice orchestration step',
          );

          /*
          const result = await this.post(`${baseUrl}${endpoint}`, accountSid, authToken, form);
          const ref = result.Call?.Sid;
          */

          // Mock Success Response
          const ref = `mock-exotel-batch-${i}-${Date.now()}`;
          const result = { Call: { Sid: ref, Status: 'queued' } };
          logger.info(
            {
              flow: 'voice_orchestration',
              step: 'STEP_10_EXOTEL_API_RESPONSE',
              traceId,
              provider: this.name,
              accepted: Boolean(ref),
              providerReference: ref,
              status: result.Call?.Status,
              batchIndex: i,
            },
            'Voice orchestration step',
          );
          if (ref) {
            successCount++;
            if (!firstReference) {
              firstReference = ref;
            }
          } else {
            failureCount++;
          }
        } catch (err) {
          failureCount++;
          logger.error(
            { provider: this.name, err, index: i, traceId, step: 'STEP_ERROR_EXOTEL_API_BATCH' },
            'Exotel API batch request failed',
          );
        }

        if (sleepMs > 0 && i < recipients.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
        }
      }

      return {
        accepted: successCount > 0,
        providerReference: firstReference,
        message: `Exotel batch completed: success=${successCount}, failed=${failureCount}`,
      };
    } catch (err) {
      logger.error(
        { provider: this.name, err, traceId, step: 'STEP_ERROR_EXOTEL_API' },
        'Failed to connect to Exotel API',
      );
      return { accepted: false, message: err instanceof Error ? err.message : 'Unknown Exotel error' };
    }
  }
}