import { logger } from '../../../utils/logger';
import type { IVoiceProvidersPlugin } from '../../../plugins/voice-providers';
import type { EntityQueryService } from './entity-query.service';
import { PhoneDiscoveryService } from './phone-discovery.service';
import type { RoutingRule } from '../types';
import type { RoutingConditionNode } from '../domain/condition.types';

export class VoiceCampaignService {
  constructor(
    private readonly entityQueryService: EntityQueryService,
    private readonly voiceProvidersPlugin: IVoiceProvidersPlugin,
  ) {}

  /**
   * Executes a campaign by finding all entities matching a rule 
   * and initiating outbound calls for each.
   */
  async executeForRule(tenantId: string, entityType: string, rule: RoutingRule): Promise<{ 
    total: number; 
    initiated: number; 
    failed: number;
    details: any[];
  }> {
    logger.info({ tenantId, entityType, ruleId: rule.id }, 'VoiceCampaign: Executing for rule');

    // 1. Fetch matching entities
    const entities = await this.entityQueryService.fetchEntitiesByRule({
      tenantId,
      entityType,
      conditions: rule.conditions as RoutingConditionNode,
      limit: 1000 // Limit to prevent runaway calls in first version
    });

    logger.info({ count: entities.length }, 'VoiceCampaign: Found matching entities');

    let initiated = 0;
    let failed = 0;
    const details: any[] = [];

    // 2. Iterate and Call
    for (const entity of entities) {
      const phone = PhoneDiscoveryService.getE164Phone(entity.attributes);

      if (!phone) {
        logger.warn({ entityId: entity.id }, 'VoiceCampaign: Skipping entity - no phone number discovered');
        failed++;
        continue;
      }

      try {
        const provider = this.voiceProvidersPlugin.get(rule.action.provider);
        const result = await provider.initiateCall({
          phone,
          attributes: entity.attributes,
          agentId: rule.action.agentId,
          config: rule.action.config,
          // userId can be entity ID for tracking
          userId: entity.id,
        });

        if (result.accepted) {
          initiated++;
        } else {
          failed++;
        }
        
        details.push({
          entityId: entity.id,
          phone,
          success: result.accepted,
          ref: result.providerReference
        });
      } catch (err) {
        logger.error({ entityId: entity.id, err }, 'VoiceCampaign: Initiation failed');
        failed++;
        details.push({
          entityId: entity.id,
          phone,
          success: false,
          error: (err as Error).message
        });
      }
    }

    return {
      total: entities.length,
      initiated,
      failed,
      details
    };
  }
}
