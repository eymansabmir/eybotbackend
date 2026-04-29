import type { CredentialType } from '@prisma/client';
import type { IVoiceProvidersPlugin } from '../../../plugins/voice-providers';
import type { VoiceCallRecipient } from '../../../plugins/voice-providers';
import type { VoiceExecutionRequest } from '../../../plugins/voice-providers';
import type { ICredentialService } from '../../credentials/credentials.service';
import { NotFoundError, ValidationError } from '../../../utils/errors';
import { logger } from '../../../utils/logger';
import { ConditionEvaluator } from '../domain/evaluator';
import type { IVoiceRoutingRepository } from '../data/routing.repository';
import type { RoutingAction, RoutingActionResult, RoutingExecutionInput } from '../domain/rule.types';

export class VoiceRoutingService {
  constructor(
    private readonly routingRepo: IVoiceRoutingRepository,
    private readonly voiceProvidersPlugin: IVoiceProvidersPlugin,
    private readonly credentialService?: ICredentialService,
  ) { }

  private async safeRecordEvent(input: RoutingExecutionInput, data: any) {
    if (input.skipIntermediateEvents) return;
    await this.routingRepo.recordEvent(data).catch(() => {});
  }

  async route(input: RoutingExecutionInput): Promise<{
    matchedRuleId: string | null;
    action: unknown;
    providerResult?: RoutingActionResult;
  }> {
    const startTime = Date.now();
    const traceId = input.traceId ?? `voice-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const attributeKeys = Object.keys(input.attributes);

    const baseEvent = {
      tenantId: input.tenantId,
      traceId,
      routingConfigId: input.routingConfigId,
    };

    await this.safeRecordEvent(input, {
      ...baseEvent,
      step: 'STEP_3_SERVICE_PROCESSING',
      metadata: {
        attributeKeyCount: attributeKeys.length,
      }
    });

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_3_SERVICE_PROCESSING',
        traceId,
        tenantId: input.tenantId,
        routingConfigId: input.routingConfigId,
        attributeKeyCount: attributeKeys.length,
        attributeKeySample: attributeKeys.slice(0, 10),
      },
      'Voice orchestration step',
    );

    const config = input.preloadedConfig || await this.routingRepo.getRoutingConfig(input.routingConfigId, input.tenantId);
    if (!config) {
      throw new NotFoundError('RoutingConfig', input.routingConfigId);
    }

    const orchestrationContext = {
      ...baseEvent,
      entityId: input.entityId,
      entityTypeId: config.entityTypeId,
    };

    await this.safeRecordEvent(input, {
      ...orchestrationContext,
      step: 'STEP_4_ROUTING_CONFIG_LOADED',
      metadata: {
        ruleCount: config.rules.length,
      }
    });

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_4_ROUTING_CONFIG_LOADED',
        traceId,
        routingConfigId: config.id,
        ruleCount: config.rules.length,
      },
      'Voice orchestration step',
    );

    const sortedRules = [...config.rules].sort((a, b) => a.priority - b.priority);

    // Prepare evaluation context: ensure attributes are prefixed with entity type for mixed-entity rules
    const evalContext = { ...input.attributes };
    if (input.entityType) {
      const prefix = `${input.entityType}.`;
      Object.entries(input.attributes).forEach(([key, value]) => {
        if (!key.includes('.')) {
          evalContext[`${prefix}${key}`] = value;
        }
      });
    }

    let matchedRule = sortedRules.find((rule) => {
      const matched = ConditionEvaluator.evaluate(rule.conditions, evalContext);
      
      this.safeRecordEvent(input, {
        ...orchestrationContext,
        step: 'STEP_5_RULE_EVALUATED',
        matchedRuleId: rule.id,
        voiceProviderId: rule.voiceProviderId ?? undefined,
        metadata: {
          matched,
          priority: rule.priority,
        }
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_5_RULE_EVALUATED',
          traceId,
          ruleId: rule.id,
          priority: rule.priority,
          matched,
        },
        'Voice orchestration step',
      );
      return matched;
    });

    if (!matchedRule) {
      await this.safeRecordEvent(input, {
        ...orchestrationContext,
        step: 'STEP_6_NO_RULE_MATCH',
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_6_NO_RULE_MATCH',
          traceId,
        },
        'Voice orchestration step',
      );

      return {
        matchedRuleId: null,
        action: null,
      };
    }

    await this.safeRecordEvent(input, {
      ...orchestrationContext,
      step: 'STEP_6_RULE_MATCHED',
      matchedRuleId: matchedRule.id,
      voiceProviderId: matchedRule.voiceProviderId ?? undefined,
    });

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_6_RULE_MATCHED',
        traceId,
        matchedRuleId: matchedRule.id,
        priority: matchedRule.priority,
      },
      'Voice orchestration step',
    );

    if (!input.executeProvider) {
      await this.safeRecordEvent(input, {
        ...orchestrationContext,
        step: 'STEP_7_PROVIDER_EXECUTION_SKIPPED',
        matchedRuleId: matchedRule.id,
        voiceProviderId: matchedRule.voiceProviderId ?? undefined,
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_7_PROVIDER_EXECUTION_SKIPPED',
          traceId,
          matchedRuleId: matchedRule.id,
        },
        'Voice orchestration step',
      );

      return {
        matchedRuleId: matchedRule.id,
        action: matchedRule.action,
      };
    }

    const request = this.buildExecutionRequest(input, matchedRule.action);
    const selectedVoiceProvider = this.getVoiceProviderName(matchedRule.action);
    const selectedExecutionProvider = this.getExecutionProviderName(matchedRule.action, request.transport);

    await this.safeRecordEvent(input, {
      ...orchestrationContext,
      step: 'STEP_7_ROUTING_REDIRECTION_DECIDED',
      matchedRuleId: matchedRule.id,
      voiceProviderId: matchedRule.voiceProviderId ?? undefined,
      metadata: {
        voiceProvider: selectedVoiceProvider,
        executionProvider: selectedExecutionProvider,
        transport: request.transport,
        mode: request.mode,
      }
    });

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_7_ROUTING_REDIRECTION_DECIDED',
        traceId,
        matchedRuleId: matchedRule.id,
        voiceProvider: selectedVoiceProvider,
        executionProvider: selectedExecutionProvider,
        transport: request.transport,
        mode: request.mode,
      },
      'Voice orchestration step',
    );

    const provider = this.voiceProvidersPlugin.get(selectedExecutionProvider);
    const providerConfig = await this.resolveProviderConfig(input, matchedRule.action);

    await this.safeRecordEvent(input, {
      ...orchestrationContext,
      step: 'STEP_8_PROVIDER_INVOCATION_START',
      matchedRuleId: matchedRule.id,
      voiceProviderId: matchedRule.voiceProviderId ?? undefined,
      metadata: {
        provider: provider.name,
      }
    });

    logger.info(
      {
        flow: 'voice_orchestration',
        step: 'STEP_8_PROVIDER_INVOCATION_START',
        traceId,
        matchedRuleId: matchedRule.id,
        provider: provider.name,
      },
      'Voice orchestration step',
    );

    try {
      const providerResult = await provider.initiateCall({
        provider: selectedExecutionProvider,
        tenantId: input.tenantId,
        traceId,
        userId: input.userId,
        phone: input.phone,
        attributes: input.attributes,
        entityType: input.entityType,
        agentId: matchedRule.action.agentId,
        providerConfig: {
          ...providerConfig,
          voiceProvider: selectedVoiceProvider,
          telephonyProvider: matchedRule.action.telephonyProvider,
        },
        request,
      });

      const durationMs = Date.now() - startTime;

      await this.routingRepo.recordEvent({
        ...orchestrationContext,
        step: 'STEP_9_PROVIDER_RESULT',
        matchedRuleId: matchedRule.id,
        voiceProviderId: matchedRule.voiceProviderId ?? undefined,
        accepted: providerResult.accepted,
        message: providerResult.message,
        durationMs,
        metadata: {
          provider: provider.name,
          voiceProvider: selectedVoiceProvider,
          providerReference: providerResult.providerReference,
          providerResponse: providerResult,
        }
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_9_PROVIDER_RESULT',
          traceId,
          matchedRuleId: matchedRule.id,
          accepted: providerResult.accepted,
          providerReference: providerResult.providerReference,
          message: providerResult.message,
        },
        'Voice orchestration step',
      );

      return {
        matchedRuleId: matchedRule.id,
        action: matchedRule.action,
        providerResult,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;

      await this.routingRepo.recordEvent({
        ...orchestrationContext,
        step: 'STEP_ERROR_PROVIDER_INVOCATION',
        matchedRuleId: matchedRule.id,
        voiceProviderId: matchedRule.voiceProviderId ?? undefined,
        accepted: false,
        message: (err as Error).message,
        durationMs,
        metadata: {
          provider: provider.name,
          voiceProvider: selectedVoiceProvider,
          error: (err as Error).message,
        }
      });

      logger.error(
        {
          flow: 'voice_orchestration',
          step: 'STEP_ERROR_PROVIDER_INVOCATION',
          traceId,
          matchedRuleId: matchedRule.id,
          provider: provider.name,
          err,
        },
        'Voice orchestration failed while invoking provider',
      );
      throw err;
    }
  }

  private buildExecutionRequest(
    input: RoutingExecutionInput,
    action: RoutingAction,
  ): VoiceExecutionRequest {
    const config = this.getProviderConfig(action);
    const mode = action.mode ?? (config?.['mode'] === 'batch' ? 'batch' : 'single');
    const transport = action.channel;

    if (mode === 'single') {
      return {
        mode,
        transport,
        recipient: {
          phoneE164: input.phone,
          whatsappUserId: typeof config?.['whatsappUserId'] === 'string' ? config['whatsappUserId'] : undefined,
          attributes: input.attributes,
        },
      };
    }

    // Batch mode expects recipients inside action.config.recipients[]
    const rawRecipients = Array.isArray(config?.['recipients'])
      ? (config?.['recipients'] as unknown[])
      : [];

    const recipients = rawRecipients
      .map((item): VoiceCallRecipient | null => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const record = item as Record<string, unknown>;
        return {
          phoneE164: typeof record['phoneE164'] === 'string' ? record['phoneE164'] : undefined,
          whatsappUserId: typeof record['whatsappUserId'] === 'string' ? record['whatsappUserId'] : undefined,
          attributes: typeof record['attributes'] === 'object' && record['attributes'] != null
            ? (record['attributes'] as Record<string, unknown>)
            : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    return {
      mode,
      transport,
      recipients,
      batch: {
        callName: typeof config?.['callName'] === 'string' ? config['callName'] : undefined,
        scheduledTimeUnix: typeof config?.['scheduledTimeUnix'] === 'number' ? config['scheduledTimeUnix'] : undefined,
        timezone: typeof config?.['timezone'] === 'string' ? config['timezone'] : undefined,
        targetConcurrencyLimit: typeof config?.['targetConcurrencyLimit'] === 'number'
          ? config['targetConcurrencyLimit']
          : undefined,
      },
    };
  }

  private getVoiceProviderName(action: RoutingAction): string {
    return action.voiceProvider;
  }

  private getExecutionProviderName(action: RoutingAction, transport: VoiceExecutionRequest['transport']): string {
    if (transport === 'telephony' && action.telephonyProvider) {
      return action.telephonyProvider;
    }
    return this.getVoiceProviderName(action);
  }

  private getProviderConfig(action: RoutingAction): Record<string, unknown> {
    return action.runtimeConfig ?? {};
  }

  private async resolveProviderConfig(input: RoutingExecutionInput, action: RoutingAction): Promise<Record<string, unknown>> {
    const baseConfig = this.getProviderConfig(action);
    const orgId = input.tenantId;

    if (!this.credentialService) {
      return baseConfig;
    }

    const mergedConfig: Record<string, unknown> = { ...baseConfig };

    // 1. Voice Credentials
    const expectedVoiceType = this.resolveVoiceCredentialType(action);
    if (!expectedVoiceType) {
      throw new ValidationError(`Unsupported voice provider: ${action.voiceProvider}`);
    }

    if (input.preloadedCredentials?.[action.voiceCredentialId]) {
      Object.assign(mergedConfig, input.preloadedCredentials[action.voiceCredentialId]);
    } else {
      const voiceSecret = await this.credentialService.decryptSecret(orgId, action.voiceCredentialId, expectedVoiceType);
      Object.assign(mergedConfig, voiceSecret);
    }
    mergedConfig['voiceCredentialId'] = action.voiceCredentialId;

    // 2. Telephony Credentials
    const expectedTelephonyType = this.resolveTelephonyCredentialType(action);
    if (!expectedTelephonyType) {
      throw new ValidationError(`Unsupported telephony provider: ${action.telephonyProvider}`);
    }

    if (input.preloadedCredentials?.[action.telephonyCredentialId]) {
      mergedConfig['telephonySecret'] = input.preloadedCredentials[action.telephonyCredentialId];
      logger.debug({ traceId: input.traceId, credId: action.telephonyCredentialId }, 'Using pre-loaded telephony credential');
    } else {
      const telephonySecret = await this.credentialService.decryptSecret(orgId, action.telephonyCredentialId, expectedTelephonyType);
      mergedConfig['telephonySecret'] = telephonySecret;
      logger.debug({ traceId: input.traceId, credId: action.telephonyCredentialId }, 'Decrypted telephony credential (fallback)');
    }
    mergedConfig['telephonyCredentialId'] = action.telephonyCredentialId;

    return mergedConfig;
  }

  public resolveVoiceCredentialType(action: RoutingAction): CredentialType | null {
    const provider = action.voiceProvider.toLowerCase();
    if (provider === 'elevenlabs') return 'ELEVENLABS';
    if (provider === 'sarvam') return 'SARVAM';
    if (provider === 'vapi') return 'VAPI';
    return null;
  }

  public resolveTelephonyCredentialType(action: RoutingAction): CredentialType | null {
    const provider = action.telephonyProvider?.toLowerCase();
    if (provider === 'exotel') return 'EXOTEL';
    if (provider === 'sarvam') return 'SARVAM';
    if (provider === 'vapi') return 'VAPI';
    if (provider === 'elevenlabs') return 'ELEVENLABS';
    return null;
  }
}
