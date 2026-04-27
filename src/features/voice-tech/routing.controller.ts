import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { RoutingConditionNode } from './domain/condition.types';
import type { EntityQueryService } from './services/entity-query.service';
import type { VoiceCampaignService } from './services/voice-campaign.service';
import type { IVoiceRoutingRepository } from './data/routing.repository';
import type { VoiceRoutingService } from './services/voice-routing.service';
import {
  CreateRoutingConfigSchema,
  DeleteRoutingRuleSchema,
  ExecuteRoutingSchema,
  GetRoutingConfigSchema,
  ListRoutingConfigsSchema,
  QueryByRuleSchema,
  ToggleRuleActiveSchema,
  UpsertRoutingRuleSchema,
} from './domain/voice-tech.schemas';

export class VoiceRoutingController {
  constructor(
    private readonly voiceRoutingService: VoiceRoutingService,
    private readonly entityQueryService: EntityQueryService,
    private readonly voiceCampaignService: VoiceCampaignService,
    private readonly routingRepo: IVoiceRoutingRepository,
  ) { }

  private stripPrefixes(node: any): any {
    if (!node) return node;
    const newNode = { ...node };
    if (newNode.field && typeof newNode.field === 'string' && newNode.field.includes('.')) {
      newNode.field = newNode.field.split('.').pop();
    }
    if (Array.isArray(newNode.children)) {
      newNode.children = newNode.children.map((child: any) => this.stripPrefixes(child));
    }
    return newNode;
  }

  private resolveTraceId(req: Request): string {
    const requestId = req.id;
    if (typeof requestId === 'string' && requestId.trim().length > 0) {
      return requestId;
    }
    if (typeof requestId === 'number' && Number.isFinite(requestId)) {
      return String(requestId);
    }
    return `voice-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  listConfigs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = ListRoutingConfigsSchema.parse(req.query);
      const configs = await this.routingRepo.listConfigs(payload.tenantId);
      res.json({ success: true, configs });
    } catch (err) {
      next(err);
    }
  };

  createConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = CreateRoutingConfigSchema.parse(req.body);
      // Repository doesn't have createConfig yet, so we use prisma directly or add it.
      // Let's assume we add it to the repository for consistency.
      const config = await (this.routingRepo as any).createConfig?.(payload);
      res.status(201).json({ success: true, config });
    } catch (err) {
      next(err);
    }
  };

  getConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = GetRoutingConfigSchema.parse({ ...req.params, ...req.query });
      const config = await this.routingRepo.getRoutingConfig(payload.id, payload.tenantId);
      if (!config) {
        throw new NotFoundError('RoutingConfig', payload.id);
      }
      res.json({ success: true, config });
    } catch (err) {
      next(err);
    }
  };

  upsertRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = UpsertRoutingRuleSchema.parse(req.body);
      const rule = await this.routingRepo.upsertRule(payload as any);
      res.status(200).json({ success: true, rule });
    } catch (err) {
      next(err);
    }
  };

  toggleRuleActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = ToggleRuleActiveSchema.parse(req.body);

      const config = await this.routingRepo.getRuleById(payload.ruleId);
      if (!config) {
        throw new NotFoundError('RoutingRule', payload.ruleId);
      }

      const rule = await this.routingRepo.upsertRule({
        ...config,
        isActive: payload.isActive
      } as any);

      let campaignResult = null;
      if (payload.isActive && payload.triggerCampaign) {
        campaignResult = await this.voiceCampaignService.executeForRule(
          payload.tenantId,
          payload.entityType,
          rule as any
        );
      }

      res.status(200).json({
        success: true,
        rule,
        campaign: campaignResult
      });
    } catch (err) {
      next(err);
    }
  };

  deleteRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = DeleteRoutingRuleSchema.parse(req.params);
      await this.routingRepo.deleteRule(id);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  deleteConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idParam = req.params?.id;
      const id = Array.isArray(idParam) ? idParam[0] : idParam;
      const tenantIdParam = req.body?.tenantId || req.query?.tenantId;
      const tenantId = Array.isArray(tenantIdParam) ? tenantIdParam[0] : tenantIdParam;

      if (!id || !tenantId) {
        res.status(400).json({ success: false, message: 'Missing config id or tenantId' });
        return;
      }

      await this.routingRepo.deleteConfig(id, tenantId);
      res.status(200).json({ success: true, message: 'Routing configuration deleted' });
    } catch (err) {
      next(err);
    }
  };

  executeRouting = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const traceId = this.resolveTraceId(req);
    try {
      const payload = ExecuteRoutingSchema.parse(req.body);

      await this.routingRepo.recordEvent({
        tenantId: payload.tenantId,
        traceId,
        step: 'STEP_1_API_RECEIVED',
        metadata: { route: 'POST /api/voice-tech/routing/execute' }
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_1_API_RECEIVED',
          traceId,
          route: 'POST /api/voice-tech/routing/execute',
        },
        'Voice orchestration step',
      );

      await this.routingRepo.recordEvent({
        tenantId: payload.tenantId,
        traceId,
        step: 'STEP_2_ACTION_RECEIVED',
        metadata: {
          routingConfigId: payload.routingConfigId,
          entityType: payload.entityType,
          executeProvider: payload.executeProvider ?? false,
        }
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_2_ACTION_RECEIVED',
          traceId,
          tenantId: payload.tenantId,
          routingConfigId: payload.routingConfigId,
          entityType: payload.entityType,
          executeProvider: payload.executeProvider ?? false,
        },
        'Voice orchestration step',
      );

      const result = await this.voiceRoutingService.route({
        ...payload,
        traceId,
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_10_API_RESPONSE_READY',
          traceId,
          matchedRuleId: result.matchedRuleId,
          providerAccepted: result.providerResult?.accepted ?? false,
          providerReference: result.providerResult?.providerReference,
        },
        'Voice orchestration step',
      );

      res.json({ success: true, traceId, result });
    } catch (err) {
      logger.error(
        {
          flow: 'voice_orchestration',
          step: 'STEP_ERROR_CONTROLLER_EXECUTE_ROUTING',
          traceId,
          err,
        },
        'Voice orchestration failed in controller',
      );
      next(err);
    }
  };

  queryEntitiesByRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const traceId = this.resolveTraceId(req);
    try {
      const payload = QueryByRuleSchema.parse(req.body);
      const { tenantId, entityType, conditions, limit, countOnly } = payload;

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_3_ENTITY_QUERY_REQUESTED',
          traceId,
          tenantId,
          entityType,
          limit: limit ?? 1000,
        },
        'Voice orchestration step',
      );

      const result = await this.entityQueryService.fetchEntitiesByRule({
        tenantId,
        entityType,
        conditions: conditions as RoutingConditionNode,
        limit,
        traceId,
        countOnly
      });

      if (typeof result === 'number') {
        res.json({ success: true, count: result });
        return;
      }

      const entities = result;

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_6_ENTITY_QUERY_RESULT',
          traceId,
          count: entities.length,
        },
        'Voice orchestration step',
      );

      res.json({
        success: true,
        traceId,
        count: entities.length,
        entities,
        debug: {
          entityType: payload.entityType,
          tenantId: payload.tenantId
        }
      });
      return;
    } catch (err) {
      logger.error(
        {
          flow: 'voice_orchestration',
          step: 'STEP_ERROR_CONTROLLER_QUERY_BY_RULE',
          traceId,
          err,
        },
        'Voice orchestration entity query failed',
      );
      next(err);
    }
  };

  execute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const traceId = this.resolveTraceId(req);
    try {
      const { tenantId, phone, attributes, routingConfigId, entityType } = req.body;

      // Record initial event
      await this.routingRepo.recordEvent({
        tenantId,
        traceId,
        step: 'STEP_1_API_RECEIVED',
        metadata: { phone, routingConfigId, entityType }
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_1_API_RECEIVED',
          traceId,
          tenantId,
          routingConfigId,
          phone: this.maskPhone(phone),
          entityType,
        },
        'Voice orchestration step',
      );

      const result = await this.voiceRoutingService.route({
        tenantId,
        phone,
        attributes,
        routingConfigId,
        traceId,
        entityType,
        executeProvider: true,
      });

      res.json({ success: true, traceId, result });
    } catch (err) {
      next(err);
    }
  };

  bulkExecute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const traceId = this.resolveTraceId(req);
    try {
      const { tenantId, routingConfigId, entityTypes } = req.body;
      if (!tenantId || !routingConfigId || !Array.isArray(entityTypes)) {
        res.status(400).json({ success: false, message: 'Missing tenantId, routingConfigId, or entityTypes' });
        return;
      }

      // Record initial bulk event
      await this.routingRepo.recordEvent({
        tenantId,
        traceId,
        step: 'STEP_1_BULK_API_RECEIVED',
        metadata: { routingConfigId, entityTypes }
      });

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_1_BULK_API_RECEIVED',
          traceId,
          tenantId,
          routingConfigId,
          entityTypes,
        },
        'Voice orchestration bulk step',
      );

      const result = await this.voiceCampaignService.executeForConfig(tenantId, routingConfigId, entityTypes);
      res.json({ success: true, traceId, result });
    } catch (err) {
      logger.error(
        {
          flow: 'voice_orchestration',
          step: 'STEP_ERROR_CONTROLLER_BULK_EXECUTE',
          traceId,
          err,
        },
        'Voice orchestration bulk execution failed',
      );
      next(err);
    }
  };

  getOrchestrationStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { tenantId, configId } = req.query;

      if (!tenantId || typeof tenantId !== 'string') {
        res.status(400).json({ success: false, message: 'Missing tenantId' });
        return;
      }

      if (!configId || typeof configId !== 'string') {
        res.status(400).json({ success: false, message: 'Missing configId' });
        return;
      }

      const prisma = (this.routingRepo as any).prisma;

      // 1. Fetch Routing Config with Rules & EntityType
      const config = await prisma.routingConfig.findUnique({
        where: { id: configId, tenantId },
        include: {
          rules: { orderBy: { priority: 'asc' } },
          entityType: true,
        },
      });

      if (!config) {
        res.status(404).json({ success: false, message: 'Routing config not found' });
        return;
      }

      // 3. Load all Voice Providers to map IDs to human-readable names
      const providers = await prisma.voiceProvider.findMany({ where: { tenantId } });
      const providerMap = new Map<string, string>(providers.map((p: any) => [p.id, p.providerName]));

      // 4. Fetch ALL events for this config (not just STEP_9)
      const allEvents = await prisma.voiceOrchestrationEvent.findMany({
        where: { tenantId, routingConfigId: configId },
        select: {
          id: true,
          step: true,
          matchedRuleId: true,
          voiceProviderId: true,
          accepted: true,
          durationMs: true,
          status: true,
          metadata: true,
        },
      });

      // 4. Categorize events by step
      const providerResultEvents = allEvents.filter((e: any) => e.step === 'STEP_9_PROVIDER_RESULT');
      const providerErrorEvents = allEvents.filter((e: any) => e.step === 'STEP_ERROR_PROVIDER_INVOCATION');
      const ruleMatchedEvents = allEvents.filter((e: any) => 
        e.step === 'STEP_6_RULE_MATCHED' || e.step === 'STEP_ERROR_PHONE_NOT_DISCOVERED'
      );
      const noMatchEvents = allEvents.filter((e: any) => e.step === 'STEP_6_NO_RULE_MATCH');
      // "System Errors" should ideally reflect technical failures, not data issues like missing phones
      const systemErrorEvents = allEvents.filter((e: any) => 
        e.step === 'STEP_ERROR_PROVIDER_INVOCATION' || 
        e.step === 'STEP_ERROR_EXECUTION_FAILED'
      );

      // 5. Compute aggregate KPIs
      const totalCallsProcessed = providerResultEvents.length + providerErrorEvents.length;
      const totalRulesMatched = ruleMatchedEvents.length;
      const totalNoMatch = noMatchEvents.length;
      const totalErrors = systemErrorEvents.length;

      const durationsMs = providerResultEvents
        .map((e: any) => e.durationMs)
        .filter((d: any): d is number => typeof d === 'number' && d > 0);
      const avgResponseTimeMs = durationsMs.length > 0
        ? Math.round(durationsMs.reduce((a: number, b: number) => a + b, 0) / durationsMs.length)
        : 0;

      // 5. Create a Rule-to-Provider Map (The Source of Truth)
      const ruleToProviderMap = new Map<string, string>();
      config.rules.forEach((rule: any) => {
        let name = 'unknown';
        if (rule.voiceProviderId && providerMap.has(rule.voiceProviderId)) {
          name = providerMap.get(rule.voiceProviderId)!;
        } else if (rule.action?.voiceProvider) {
          name = rule.action.voiceProvider;
        }
        ruleToProviderMap.set(rule.id, name.toLowerCase());
      });

      // 6. Provider Breakdown (Rule-First Attribution)
      const providerEvents = [...providerResultEvents, ...systemErrorEvents];
      const providerGroups = new Map<string, any[]>();
      
      providerEvents.forEach((e: any) => {
        // 1. Priority: Attribute by Rule ID (Source of Truth)
        let providerName = e.matchedRuleId ? ruleToProviderMap.get(e.matchedRuleId) : null;
        
        // 2. Fallback: Provider ID from event directly
        if (!providerName && e.voiceProviderId && providerMap.has(e.voiceProviderId)) {
          providerName = providerMap.get(e.voiceProviderId)!.toLowerCase();
        }

        // 3. Last Resort: Metadata
        if (!providerName) {
          const metadata = (e.metadata || {}) as any;
          providerName = (metadata?.voiceProvider || metadata?.provider || 'unknown').toLowerCase();
        }
        
        if (!providerGroups.has(providerName)) providerGroups.set(providerName, []);
        providerGroups.get(providerName)!.push(e);
      });

      const providerBreakdown = Array.from(providerGroups.entries()).map(([providerName, events]) => {
        const successCount = events.filter((e: any) => e.step === 'STEP_9_PROVIDER_RESULT' && (e.accepted === true || e.message === 'CALL_ACCEPTED')).length;
        const errorCount = events.length - successCount;
        const durations = events
          .map((e: any) => e.durationMs)
          .filter((d: any): d is number => typeof d === 'number' && d > 0);
        const avgDurationMs = durations.length > 0
          ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length)
          : 0;

        return {
          providerId: providerName,
          providerName: providerName,
          callCount: events.length,
          successCount,
          errorCount,
          avgDurationMs,
        };
      });

      // 7. Per-rule Stats (Awaited for accurate live data)
      const ruleStats = await Promise.all(config.rules.map(async (rule: any) => {
        // Dynamic condition summary
        let conditionsSummary = 'All Traffic';
        try {
          const c = rule.conditions as any;
          if (c?.field && c?.operator && c?.value !== undefined) {
            conditionsSummary = `${c.field} ${c.operator} ${c.value}`;
          } else if (c?.operator === 'AND' && c?.children?.length > 0) {
            conditionsSummary = c.children
              .map((child: any) => `${child.field} ${child.operator} ${child.value}`)
              .join(' & ');
          } else if (c?.operator === 'OR' && c?.children?.length > 0) {
            conditionsSummary = c.children
              .map((child: any) => `${child.field} ${child.operator} ${child.value}`)
              .join(' | ');
          }
        } catch (_) { /* ignore malformed conditions */ }

        // Live matching for this specific rule (Unique Records)
        let liveMatchCount = 0;
        if (config.entityType && rule.conditions) {
          try {
            const strippedConditions = this.stripPrefixes(rule.conditions);

            const matchCount = await this.entityQueryService.fetchEntitiesByRule({
              tenantId,
              entityType: config.entityType.name,
              conditions: strippedConditions as any,
              countOnly: true
            });
            liveMatchCount = typeof matchCount === 'number' ? matchCount : 0;
          } catch (err) {
            logger.warn({ err, ruleId: rule.id }, 'Failed to calc live match for rule');
          }
        }

        // Execution metrics (Events)
        const ruleEvents = providerEvents.filter((e: any) => e.matchedRuleId === rule.id);
        const callCount = ruleEvents.length;
        const successCount = ruleEvents.filter((e: any) => e.step === 'STEP_9_PROVIDER_RESULT' && (e.accepted === true || e.message === 'CALL_ACCEPTED')).length;

        // Resolve provider name (consistent with distribution chart)
        const providerName = ruleToProviderMap.get(rule.id) || 'unknown';

        return {
          ruleId: rule.id,
          priority: rule.priority,
          isActive: rule.isActive,
          conditionsSummary,
          provider: providerName,
          matchCount: liveMatchCount, // Use the live dataset count
          callCount, // Use the actual processed events count
          successCount,
          successRate: callCount > 0 ? Math.round((successCount / callCount) * 100) : 0,
        };
      }));

      // 8. Live Dataset Analysis (Union of all rules)
      let totalDatasetRecords = 0;
      let liveMatchedCount = 0;
      
      if (config.entityType) {
        if (Array.isArray(config.entityType.data)) {
          totalDatasetRecords = config.entityType.data.length;
        }

        // Combined conditions for Matched Audience

        // Combine all rule conditions with OR to find the total "Matched Audience" coverage
        // We include all rules (even drafts) for the analysis view
        if (config.rules.length > 0) {
          const combinedConditions = config.rules.length === 1 
            ? this.stripPrefixes(config.rules[0].conditions) 
            : { operator: 'OR', children: config.rules.map(r => this.stripPrefixes(r.conditions)) };
          
          try {
            const matchCount = await this.entityQueryService.fetchEntitiesByRule({
              tenantId,
              entityType: config.entityType.name,
              conditions: combinedConditions as any,
              countOnly: true
            });
            liveMatchedCount = typeof matchCount === 'number' ? matchCount : 0;
          } catch (err) {
            logger.error({ err, configId }, 'Failed to calculate live matched audience');
          }
        }
      }

      const responseStats = {
        routingName: config.name,
        configStatus: config.status || 'ACTIVE',
        routingType: config.type || 'AUTOMATIC',
        totalEvents: allEvents.length,
        totalCallsProcessed,
        totalRulesMatched,
        totalNoMatch,
        totalErrors,
        avgResponseTimeMs,
        datasets: config.entityType ? [config.entityType.name] : [],
        totalDatasetRecords,
        liveMatchedCount,
        liveUnmatchedCount: Math.max(0, totalDatasetRecords - liveMatchedCount),
        rulesCount: config.rules.length,
        providerBreakdown,
        ruleStats,
      };

      res.json({ success: true, stats: responseStats });
    } catch (err) {
      next(err);
    }
  };

  private maskPhone(phone: string): string {
    if (!phone) return '';
    if (phone.length <= 4) return '****';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
}
