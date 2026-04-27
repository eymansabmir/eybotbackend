import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import type { RoutingConditionNode } from './domain/condition.types';
import type { EntityQueryService } from './services/entity-query.service';
import type { VoiceCampaignService } from './services/voice-campaign.service';
import type { IVoiceRoutingRepository } from './data/routing.repository';
import type { VoiceRoutingService } from './services/voice-routing.service';
import { EXCHANGES, type IWorkerPlugin } from '../../plugins/worker';
import { type IRedisPlugin } from '../../plugins/redis';
import type { VoiceCampaignJob } from '../../plugins/worker/jobs';
import {
  BulkExecuteSchema,
  CreateRoutingConfigSchema,
  DeleteRoutingRuleSchema,
  ExecuteRoutingSchema,
  GetRoutingConfigSchema,
  ListRoutingConfigsSchema,
  QueryByRuleSchema,
  ToggleRuleActiveSchema,
  UpsertRoutingRuleSchema,
  VoiceCampaignStatusSchema,
} from './domain/voice-tech.schemas';

const VOICE_CAMPAIGN_STATUS_PREFIX = 'voice:campaign:job:';
const VOICE_CAMPAIGN_STATUS_TTL_SECONDS = 60 * 60 * 24;

export class VoiceRoutingController {
  constructor(
    private readonly voiceRoutingService: VoiceRoutingService,
    private readonly entityQueryService: EntityQueryService,
    private readonly voiceCampaignService: VoiceCampaignService,
    private readonly routingRepo: IVoiceRoutingRepository,
    private readonly workerPlugin: IWorkerPlugin,
    private readonly redisPlugin: IRedisPlugin,
  ) { }

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
      const payload = BulkExecuteSchema.parse(req.body);
      const jobId = randomUUID();

      const job: VoiceCampaignJob = {
        jobId,
        tenantId: payload.tenantId,
        routingConfigId: payload.routingConfigId,
        entityTypes: payload.entityTypes,
        retryCount: 0,
      };

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_1_BULK_API_RECEIVED',
          traceId,
          tenantId: payload.tenantId,
          routingConfigId: payload.routingConfigId,
          entityTypes: payload.entityTypes,
          jobId,
        },
        'Voice orchestration bulk step',
      );

      await this.redisPlugin.client.set(
        `${VOICE_CAMPAIGN_STATUS_PREFIX}${jobId}`,
        JSON.stringify({
          status: 'queued',
          tenantId: payload.tenantId,
          routingConfigId: payload.routingConfigId,
          entityTypes: payload.entityTypes,
          totalProcessed: 0,
          initiated: 0,
          failed: 0,
          skipped: 0,
          excluded: 0,
          retryCount: 0,
          updatedAt: new Date().toISOString(),
        }),
        'EX',
        VOICE_CAMPAIGN_STATUS_TTL_SECONDS,
      );

      await this.workerPlugin.publish(EXCHANGES.VOICE_CAMPAIGN, job);

      res.status(202).json({ success: true, traceId, jobId, status: 'queued' });
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

  getBulkExecuteStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = VoiceCampaignStatusSchema.parse(req.params);
      const value = await this.redisPlugin.client.get(`${VOICE_CAMPAIGN_STATUS_PREFIX}${jobId}`);
      if (!value) {
        res.status(404).json({ success: false, message: 'Voice campaign job not found' });
        return;
      }

      res.json({ success: true, jobId, ...(JSON.parse(value) as Record<string, unknown>) });
    } catch (err) {
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

      // 2. Fetch ALL events for this config
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

      // 3. Fetch providers to map IDs -> names
      const providers = await prisma.voiceProvider.findMany({ where: { tenantId } });
      const providerMap = new Map<string, string>(providers.map((p: any) => [p.id, p.providerName]));

      // 4. Categorize events by step
      const providerResultEvents = allEvents.filter((e: any) => e.step === 'STEP_9_PROVIDER_RESULT');
      const ruleMatchedEvents = allEvents.filter((e: any) => 
        e.step === 'STEP_6_RULE_MATCHED' || e.step === 'STEP_ERROR_PHONE_NOT_DISCOVERED'
      );
      const noMatchEvents = allEvents.filter((e: any) => e.step === 'STEP_6_NO_RULE_MATCH');
      const errorEvents = allEvents.filter((e: any) => e.step.startsWith('STEP_ERROR'));

      // 5. Compute aggregate KPIs
      const totalCallsProcessed = providerResultEvents.length;
      const totalRulesMatched = ruleMatchedEvents.length;
      const totalNoMatch = noMatchEvents.length;
      const totalErrors = errorEvents.length;

      const durationsMs = providerResultEvents
        .map((e: any) => e.durationMs)
        .filter((d: any): d is number => typeof d === 'number' && d > 0);
      const avgResponseTimeMs = durationsMs.length > 0
        ? Math.round(durationsMs.reduce((a: number, b: number) => a + b, 0) / durationsMs.length)
        : 0;

      // 6. Provider Breakdown
      const providerAgg: Record<string, { callCount: number; successCount: number; errorCount: number; totalDurationMs: number }> = {};
      for (const ev of providerResultEvents) {
        const pid = ev.voiceProviderId || 'unknown';
        if (!providerAgg[pid]) providerAgg[pid] = { callCount: 0, successCount: 0, errorCount: 0, totalDurationMs: 0 };
        providerAgg[pid].callCount += 1;
        if (ev.accepted === true) providerAgg[pid].successCount += 1;
        else providerAgg[pid].errorCount += 1;
        if (typeof ev.durationMs === 'number') providerAgg[pid].totalDurationMs += ev.durationMs;
      }

      const providerBreakdown = Object.entries(providerAgg).map(([pid, agg]) => ({
        providerId: pid,
        providerName: providerMap.get(pid) || pid || 'Unknown',
        callCount: agg.callCount,
        successCount: agg.successCount,
        errorCount: agg.errorCount,
        avgDurationMs: agg.callCount > 0 ? Math.round(agg.totalDurationMs / agg.callCount) : 0,
      }));

      // 7. Per-rule Stats (enriched)
      const ruleStats = config.rules.map((rule: any) => {
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

        // Count events for this rule
        const ruleProviderResults = providerResultEvents.filter((e: any) => e.matchedRuleId === rule.id);
        const ruleMatchCount = ruleMatchedEvents.filter((e: any) => e.matchedRuleId === rule.id).length;
        const callCount = ruleProviderResults.length;
        const successCount = ruleProviderResults.filter((e: any) => e.accepted === true).length;

        // Resolve provider name from rule action or voiceProviderId
        let providerName = 'Unknown';
        if (rule.voiceProviderId && providerMap.has(rule.voiceProviderId)) {
          providerName = providerMap.get(rule.voiceProviderId)!;
        } else {
          try {
            const action = rule.action as any;
            providerName = action?.voiceProvider || action?.telephonyProvider || 'Unknown';
          } catch (_) {}
        }

        return {
          ruleId: rule.id,
          priority: rule.priority,
          conditionsSummary,
          provider: providerName,
          providerId: rule.voiceProviderId || '',
          callCount,
          matchCount: ruleMatchCount,
          successRate: callCount > 0 ? Math.round((successCount / callCount) * 100) : 0,
          isActive: rule.isActive,
        };
      });

      // 8. Build final response
      let totalDatasetRecords = 0;
      if (config.entityType && Array.isArray(config.entityType.data)) {
        totalDatasetRecords = config.entityType.data.length;
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
