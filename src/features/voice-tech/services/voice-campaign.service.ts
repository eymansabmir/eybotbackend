import { logger } from '../../../utils/logger';
import type { EntityQueryService } from './entity-query.service';
import { PhoneDiscoveryService } from './phone-discovery.service';
import type { RoutingRuleView } from '../data/routing.repository';
import type { RoutingConditionNode } from '../domain/condition.types';
import type { VoiceRoutingService } from './voice-routing.service';

export class VoiceCampaignService {
  constructor(
    private readonly entityQueryService: EntityQueryService,
    private readonly voiceRoutingService: VoiceRoutingService,
  ) {}

  /**
   * Executes a campaign by finding all entities matching a rule 
   * and initiating outbound calls for each.
   */
  async executeForRule(tenantId: string, entityType: string, rule: RoutingRuleView): Promise<{ 
    total: number; 
    initiated: number; 
    failed: number;
    details: any[];
  }> {
    logger.info({ tenantId, entityType, ruleId: rule.id }, 'VoiceCampaign: Executing for rule');

    // 1. Fetch matching entities
    const result = await this.entityQueryService.fetchEntitiesByRule({
      tenantId,
      entityType,
      conditions: rule.conditions as RoutingConditionNode,
      limit: 1000 // Limit to prevent runaway calls in first version
    });

    if (typeof result === 'number') {
      return { total: result, initiated: 0, failed: 0, details: [] };
    }

    const entities = result;

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
        const result = await this.voiceRoutingService.route({
          tenantId,
          attributes: entity.attributes,
          routingConfigId: rule.routingConfigId,
          entityType,
          userId: entity.id,
          phone,
          executeProvider: true,
        });

        const accepted = Boolean(result.providerResult?.accepted);
        if (accepted) {
          initiated++;
        } else {
          failed++;
        }
        
        details.push({
          entityId: entity.id,
          phone,
          success: accepted,
          ref: result.providerResult?.providerReference,
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

  /**
   * Executes a bulk campaign for a whole routing config across multiple entity types.
   */
  async executeForConfig(tenantId: string, routingConfigId: string, entityTypes: string[]): Promise<{
    totalProcessed: number;
    initiated: number;
    failed: number;
    skipped: number;
    excluded: number;
    details: any[];
  }> {
    logger.info({ tenantId, routingConfigId, entityTypes }, 'VoiceCampaign: Executing for config');

    const config = await this.voiceRoutingService['routingRepo'].getRoutingConfig(routingConfigId, tenantId);
    if (!config) throw new Error('Routing configuration not found');

    const sortedRules = [...config.rules].sort((a, b) => a.priority - b.priority);
    const processedEntityIds = new Set<string>();

    let totalProcessed = 0;
    let initiated = 0;
    let failed = 0;
    let skipped = 0;
    let excluded = 0;
    const details: any[] = [];

    for (const type of entityTypes) {
      for (const rule of sortedRules) {
        // Fetch matching entities for THIS rule
        const result = await this.entityQueryService.fetchEntitiesByRule({
          tenantId,
          entityType: type,
          conditions: rule.conditions as any,
          limit: 2000 // Higher limit for bulk
        });

        if (typeof result === 'number' || !Array.isArray(result)) continue;

        for (const entity of result) {
          const entityId = entity.id || `temp-id-${Math.random()}`;
          if (processedEntityIds.has(entityId)) continue;
          processedEntityIds.add(entityId);
          
          totalProcessed++;
          const phone = PhoneDiscoveryService.getE164Phone(entity.attributes);

          if (!phone) {
            skipped++;
            details.push({ entityId: entity.id, success: false, error: 'No phone number discovered' });
            continue;
          }

          try {
            const routeResult = await this.voiceRoutingService.route({
              tenantId,
              routingConfigId,
              attributes: entity.attributes,
              entityType: type,
              phone,
              executeProvider: true,
              userId: entity.id
            });

            if (routeResult.matchedRuleId) {
              if (routeResult.providerResult?.accepted) {
                initiated++;
              } else {
                failed++;
              }
            } else {
              excluded++;
            }

            details.push({
              entityId: entity.id,
              phone,
              success: routeResult.providerResult?.accepted ?? false,
              ref: routeResult.providerResult?.providerReference,
            });
          } catch (err) {
            failed++;
            logger.error({ entityId: entity.id, err }, 'VoiceCampaign: Bulk execution failed for entity');
          }
        }
      }
    }

    return { totalProcessed, initiated, failed, skipped, excluded, details };
  }
}
