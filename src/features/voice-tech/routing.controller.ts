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

      // 1. Fetch Routing Config & Rules
      const config = await (this.routingRepo as any).prisma.routingConfig.findUnique({
        where: { id: configId, tenantId },
        include: { rules: { orderBy: { priority: 'asc' } }, entityType: true }
      });

      if (!config) {
        res.status(404).json({ success: false, message: 'Routing config not found' });
        return;
      }

      const ruleIds = config.rules.map((r: any) => r.id);

      // 2. Fetch Orchestration Events for these rules
      const events = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.findMany({
        where: {
          tenantId,
          matchedRuleId: { in: ruleIds }
        }
      });

      // Also fetch providers to map names
      const providers = await (this.routingRepo as any).prisma.voiceProvider.findMany({
        where: { tenantId }
      });

      const providerMap = new Map(providers.map((p: any) => [p.id, p.providerName]));

      // 3. Aggregate Rule Stats
      const ruleStatsMap = new Map();

      for (const rule of config.rules) {
        // Build condition summary (e.g. "brand = Asus")
        let conditionsSummary = 'All';
        try {
          const c = rule.conditions as any;
          if (c?.field && c?.operator && c?.value) {
            conditionsSummary = `${c.field} ${c.operator} ${c.value}`;
          } else if (c?.operator === 'AND' && c?.children?.length > 0) {
            conditionsSummary = `${c.children[0].field} ${c.children[0].operator} ${c.children[0].value} ...`;
          }
        } catch (e) { }

        ruleStatsMap.set(rule.id, {
          ruleId: rule.id,
          conditionsSummary,
          provider: providerMap.get(rule.voiceProviderId) || 'ElevenLabs',
          count: 0
        });
      }

      for (const event of events) {
        if (event.matchedRuleId && ruleStatsMap.has(event.matchedRuleId)) {
          ruleStatsMap.get(event.matchedRuleId).count += 1;
        }
      }

      // Calculate Total Records (All invocations on this config's rules)
      const totalRecords = events.length;

      const responseStats = {
        routingName: config.name,
        totalRecords,
        datasets: config.entityType ? [config.entityType.name] : [],
        rulesCount: config.rules.length,
        ruleStats: Array.from(ruleStatsMap.values())
      };

      res.json({
        success: true,
        stats: responseStats
      });
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
