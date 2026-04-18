import type { ExecuteVoiceProviderInput, VoiceCallRecipient, VoiceProviderAdapter } from '../../voice-providers.interface';
import { logger } from '../../../../utils/logger';

export class ElevenLabsVoiceProviderAdapter implements VoiceProviderAdapter {
  readonly name = 'elevenlabs';
  private readonly baseUrl = 'https://api.elevenlabs.io';

  private formatPhone(phone?: string): string {
    if (!phone) return '';
    const trimmed = phone.trim();
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  }

  private getApiKey(input: ExecuteVoiceProviderInput): string | undefined {
    const overrideKey = input.providerConfig?.['apiKey'];
    if (typeof overrideKey === 'string' && overrideKey.trim().length > 0) {
      return overrideKey;
    }

    return process.env.ELEVENLABS_API_KEY;
  }

  private async post<T>(apiKey: string, endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`ElevenLabs API ${endpoint} failed (${response.status}): ${JSON.stringify(errorData)}`);
    }

    return response.json() as Promise<T>;
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

  async initiateCall(input: ExecuteVoiceProviderInput): Promise<{ accepted: boolean; providerReference?: string; message?: string }> {
    const apiKey = this.getApiKey(input);

    if (!apiKey) {
      logger.error({ provider: this.name }, 'ElevenLabs API Key is missing in environment variables');
      return { accepted: false, message: 'Missing ElevenLabs API key' };
    }


    try {
      const mode = input.request?.mode ?? 'single';
      const transport = input.request?.transport ?? 'telephony';

      logger.info(
        {
          provider: this.name,
          mode,
          transport,
          agentId: input.agentId,
        },
        'Initiating ElevenLabs outbound execution',
      );

      if (mode === 'single' && transport === 'telephony') {
        const recipient = this.resolveSingleRecipient(input);
        const toNumber = this.formatPhone(recipient.phoneE164);
        if (!toNumber) {
          return { accepted: false, message: 'Missing recipient phone number (E.164)' };
        }

        const agentPhoneNumberId =
          typeof input.providerConfig?.['agentPhoneNumberId'] === 'string'
            ? input.providerConfig['agentPhoneNumberId']
            : undefined;

        if (!agentPhoneNumberId) {
          return { accepted: false, message: 'Missing ElevenLabs agentPhoneNumberId for telephony call' };
        }

        const result = await this.post<{
          success: boolean;
          message?: string;
          conversation_id?: string | null;
          callSid?: string | null;
        }>(apiKey, '/v1/convai/twilio/outbound-call', {
          agent_id: input.agentId,
          agent_phone_number_id: agentPhoneNumberId,
          to_number: toNumber,
          conversation_initiation_client_data: recipient.attributes ?? input.attributes,
          call_recording_enabled:
            typeof input.providerConfig?.['callRecordingEnabled'] === 'boolean'
              ? input.providerConfig['callRecordingEnabled']
              : undefined,
          telephony_call_config:
            typeof input.providerConfig?.['telephonyCallConfig'] === 'object'
              ? input.providerConfig['telephonyCallConfig']
              : undefined,
        });

        return {
          accepted: Boolean(result.success),
          providerReference: result.conversation_id ?? result.callSid ?? undefined,
          message: result.message,
        };
      }

      if (mode === 'single' && transport === 'whatsapp') {
        const recipient = this.resolveSingleRecipient(input);
        const whatsappUserId = recipient.whatsappUserId ?? input.userId;
        const whatsappPhoneNumberId =
          typeof input.providerConfig?.['whatsappPhoneNumberId'] === 'string'
            ? input.providerConfig['whatsappPhoneNumberId']
            : undefined;
        const templateName =
          typeof input.providerConfig?.['whatsappCallPermissionRequestTemplateName'] === 'string'
            ? input.providerConfig['whatsappCallPermissionRequestTemplateName']
            : undefined;
        const templateLangCode =
          typeof input.providerConfig?.['whatsappCallPermissionRequestTemplateLanguageCode'] === 'string'
            ? input.providerConfig['whatsappCallPermissionRequestTemplateLanguageCode']
            : undefined;

        if (!whatsappUserId || !whatsappPhoneNumberId || !templateName || !templateLangCode) {
          return {
            accepted: false,
            message: 'Missing WhatsApp config: whatsappUserId, whatsappPhoneNumberId, template name/language are required',
          };
        }

        const result = await this.post<{
          success: boolean;
          message?: string;
          conversation_id?: string | null;
        }>(apiKey, '/v1/convai/whatsapp/outbound-call', {
          whatsapp_phone_number_id: whatsappPhoneNumberId,
          whatsapp_user_id: whatsappUserId,
          whatsapp_call_permission_request_template_name: templateName,
          whatsapp_call_permission_request_template_language_code: templateLangCode,
          agent_id: input.agentId,
          conversation_initiation_client_data: recipient.attributes ?? input.attributes,
        });

        return {
          accepted: Boolean(result.success),
          providerReference: result.conversation_id ?? undefined,
          message: result.message,
        };
      }

      // Batch execution
      const recipients = input.request?.recipients ?? [];
      if (recipients.length === 0) {
        return { accepted: false, message: 'Batch mode requires at least one recipient' };
      }

      const callName = input.request?.batch?.callName ?? `batch_${Date.now()}`;

      const mappedRecipients = recipients.map((recipient) => {
        const record: Record<string, unknown> = {
          conversation_initiation_client_data: recipient.attributes ?? input.attributes,
        };

        if (transport === 'telephony' && recipient.phoneE164) {
          record['phone_number'] = this.formatPhone(recipient.phoneE164);
        }
        if (transport === 'whatsapp' && recipient.whatsappUserId) {
          record['whatsapp_user_id'] = recipient.whatsappUserId;
        }

        return record;
      });

      const body: Record<string, unknown> = {
        call_name: callName,
        agent_id: input.agentId,
        recipients: mappedRecipients,
      };

      if (input.request?.batch?.scheduledTimeUnix) {
        body['scheduled_time_unix'] = input.request.batch.scheduledTimeUnix;
      }
      if (input.request?.batch?.timezone) {
        body['timezone'] = input.request.batch.timezone;
      }
      if (input.request?.batch?.targetConcurrencyLimit) {
        body['target_concurrency_limit'] = input.request.batch.targetConcurrencyLimit;
      }

      if (transport === 'telephony') {
        const agentPhoneNumberId =
          typeof input.providerConfig?.['agentPhoneNumberId'] === 'string'
            ? input.providerConfig['agentPhoneNumberId']
            : undefined;
        if (!agentPhoneNumberId) {
          return { accepted: false, message: 'Batch telephony mode requires agentPhoneNumberId' };
        }
        body['agent_phone_number_id'] = agentPhoneNumberId;
      } else {
        const whatsappPhoneNumberId =
          typeof input.providerConfig?.['whatsappPhoneNumberId'] === 'string'
            ? input.providerConfig['whatsappPhoneNumberId']
            : undefined;
        const templateName =
          typeof input.providerConfig?.['whatsappCallPermissionRequestTemplateName'] === 'string'
            ? input.providerConfig['whatsappCallPermissionRequestTemplateName']
            : undefined;
        const templateLangCode =
          typeof input.providerConfig?.['whatsappCallPermissionRequestTemplateLanguageCode'] === 'string'
            ? input.providerConfig['whatsappCallPermissionRequestTemplateLanguageCode']
            : undefined;
        if (!whatsappPhoneNumberId || !templateName || !templateLangCode) {
          return { accepted: false, message: 'Batch WhatsApp mode requires whatsapp params configuration' };
        }
        body['whatsapp_params'] = {
          whatsapp_phone_number_id: whatsappPhoneNumberId,
          whatsapp_call_permission_request_template_name: templateName,
          whatsapp_call_permission_request_template_language_code: templateLangCode,
        };
      }

      const result = await this.post<{ id: string; status: string }>(apiKey, '/v1/convai/batch-calling/submit', body);
      return {
        accepted: true,
        providerReference: result.id,
        message: result.status,
      };
    } catch (err) {
      logger.error({ provider: this.name, err }, 'Failed to connect to ElevenLabs API');
      return { accepted: false, message: err instanceof Error ? err.message : 'Unknown ElevenLabs error' };
    }
  }
}
