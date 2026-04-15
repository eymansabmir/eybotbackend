import type { IVoiceProvidersPlugin } from '../../../plugins/voice-providers';
import { NotFoundError } from '../../../utils/errors';
import { ConditionEvaluator } from '../domain/evaluator';
import type { IVoiceRoutingRepository } from '../data/routing.repository';
import type { RoutingActionResult, RoutingExecutionInput } from '../domain/rule.types';

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
    const matchedRule = sortedRules.find((rule) => ConditionEvaluator.evaluate(rule.conditions, input.attributes));

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
    const providerResult = await provider.initiateCall({
      userId: input.userId,
      phone: input.phone,
      attributes: input.attributes,
      agentId: matchedRule.action.agentId,
      config: matchedRule.action.config,
    });

    return {
      matchedRuleId: matchedRule.id,
      action: matchedRule.action,
      providerResult,
    };
  }
}
