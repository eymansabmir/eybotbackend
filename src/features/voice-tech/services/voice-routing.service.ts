import type { IVoiceProvidersPlugin } from '../../../plugins/voice-providers';
import type { VoiceCallRecipient } from '../../../plugins/voice-providers';
import type { VoiceExecutionRequest } from '../../../plugins/voice-providers';
import { NotFoundError } from '../../../utils/errors';
import { ConditionEvaluator } from '../domain/evaluator';
import type { IVoiceRoutingRepository } from '../data/routing.repository';
import type { RoutingAction, RoutingActionResult, RoutingExecutionInput } from '../domain/rule.types';

export class VoiceRoutingService {
  constructor(
    private readonly routingRepo: IVoiceRoutingRepository,
    private readonly voiceProvidersPlugin: IVoiceProvidersPlugin,
  ) {}

  async route(input: RoutingExecutionInput): Promise<{
    matchedRuleId: string | null;
    action: unknown;
    providerResult?: RoutingActionResult;
  }> {
    const config = await this.routingRepo.getRoutingConfig(input.routingConfigId, input.tenantId);
    if (!config) {
      throw new NotFoundError('RoutingConfig', input.routingConfigId);
    }

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

    const matchedRule = sortedRules.find((rule) => ConditionEvaluator.evaluate(rule.conditions, evalContext));

    if (!matchedRule) {
      return {
        matchedRuleId: null,
        action: null,
      };
    }

    if (!input.executeProvider) {
      return {
        matchedRuleId: matchedRule.id,
        action: matchedRule.action,
      };
    }

    const provider = this.voiceProvidersPlugin.get(matchedRule.action.provider);
    const request = this.buildExecutionRequest(input, matchedRule.action);
    const providerResult = await provider.initiateCall({
      provider: matchedRule.action.provider,
      tenantId: input.tenantId,
      userId: input.userId,
      phone: input.phone,
      attributes: input.attributes,
      agentId: matchedRule.action.agentId,
      providerConfig: matchedRule.action.config,
      request,
    });

    return {
      matchedRuleId: matchedRule.id,
      action: matchedRule.action,
      providerResult,
    };
  }

  private buildExecutionRequest(
    input: RoutingExecutionInput,
    action: RoutingAction,
  ): VoiceExecutionRequest {
    const config = action.config;
    const mode = action.mode ?? (config?.['mode'] === 'batch' ? 'batch' : 'single');
    const transport = action.transport ?? (config?.['transport'] === 'whatsapp' ? 'whatsapp' : 'telephony');

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
}
