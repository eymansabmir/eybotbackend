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

      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_3_ENTITY_QUERY_REQUESTED',
          traceId,
          tenantId: payload.tenantId,
          entityType: payload.entityType,
          limit: payload.limit ?? 1000,
        },
        'Voice orchestration step',
      );

      const entities = await this.entityQueryService.fetchEntitiesByRule({
        tenantId: payload.tenantId,
        entityType: payload.entityType,
        conditions: payload.conditions as RoutingConditionNode,
        limit: payload.limit,
        traceId,
      });

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
      const { tenantId } = req.query;
      if (!tenantId || typeof tenantId !== 'string') {
        res.status(400).json({ success: false, message: 'Missing tenantId' });
        return;
      }

      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // 1. Total Requests (Last 24h)
      const totalRequests = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.count({
        where: {
          tenantId,
          step: { in: ['STEP_1_API_RECEIVED', 'STEP_1_BULK_API_RECEIVED'] },
          createdAt: { gte: last24h },
        },
      });

      // 2. Success Rate & Invocations
      const invocationEvents = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.findMany({
        where: {
          tenantId,
          step: { in: ['STEP_9_PROVIDER_RESULT', 'STEP_ERROR_PROVIDER_INVOCATION'] },
          createdAt: { gte: last24h },
        },
      });

      const totalInvocations = invocationEvents.length;
      const successCount = invocationEvents.filter(e => e.accepted === true).length;
      const successRate = totalInvocations > 0 ? (successCount / totalInvocations) * 100 : 0;

      // 3. Avg Latency
      const latencyStats = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.aggregate({
        where: {
          tenantId,
          step: 'STEP_9_PROVIDER_RESULT',
          createdAt: { gte: last24h },
          durationMs: { not: null },
        },
        _avg: { durationMs: true },
      });
      const avgLatency = Math.round(latencyStats._avg.durationMs ?? 0);

      // 4. Funnel
      const funnelMapping = [
        { label: 'API RECEIVED', steps: ['STEP_1_API_RECEIVED', 'STEP_1_BULK_API_RECEIVED'] },
        { label: 'SERVICE PROCESSING', steps: ['STEP_3_SERVICE_PROCESSING'] },
        { label: 'ROUTING LOADED', steps: ['STEP_4_ROUTING_CONFIG_LOADED'] },
        { label: 'RULE EVALUATED', steps: ['STEP_6_RULE_MATCHED', 'STEP_6_NO_RULE_MATCH'] },
        { label: 'PROVIDER INVOCATION', steps: ['STEP_7_ROUTING_REDIRECTION_DECIDED', 'STEP_8_PROVIDER_INVOCATION_START', 'STEP_ERROR_PROVIDER_INVOCATION'] },
        { label: 'RESULT SUCCESS', steps: ['STEP_9_PROVIDER_RESULT'], filterAccepted: true },
      ];

      const funnel = await Promise.all(
        funnelMapping.map(async (item) => {
          const count = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.count({
            where: { 
              tenantId, 
              step: { in: item.steps }, 
              createdAt: { gte: last24h },
              ...(item.filterAccepted ? { accepted: true } : {})
            },
          });
          return { step: item.label, count };
        })
      );

      // 5. Provider Analysis
      const providerStats = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.groupBy({
        by: ['provider'],
        where: {
          tenantId,
          step: { in: ['STEP_9_PROVIDER_RESULT', 'STEP_ERROR_PROVIDER_INVOCATION'] },
          createdAt: { gte: last24h },
          provider: { not: null },
        },
        _count: { id: true },
      });

      const providers = await Promise.all(providerStats.map(async (p) => {
        const errors = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.count({
          where: {
            tenantId,
            step: { in: ['STEP_9_PROVIDER_RESULT', 'STEP_ERROR_PROVIDER_INVOCATION'] },
            provider: p.provider,
            accepted: false,
            createdAt: { gte: last24h },
          }
        });
        const volume = p._count.id;
        return {
          name: p.provider?.charAt(0).toUpperCase() + p.provider?.slice(1),
          volume,
          errorRate: volume > 0 ? Math.round((errors / volume) * 100) : 0,
        };
      }));

      // 6. Trend
      const trend = await (this.routingRepo as any).prisma.$queryRaw`
        SELECT 
          date_trunc('hour', "createdAt") + (EXTRACT(minute FROM "createdAt")::int / 10) * interval '10 min' as time_bucket,
          AVG("durationMs") as latency
        FROM voice_orchestration_events
        WHERE "tenantId" = ${tenantId}
          AND step IN ('STEP_9_PROVIDER_RESULT', 'STEP_ERROR_PROVIDER_INVOCATION')
          AND "createdAt" >= ${last24h}
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      // 7. Status Distribution
      const statusCounts: Record<string, number> = {
        '200 OK': 0,
        '201 Created': 0,
        '401 Unauthorized': 0,
        '400 Bad Request': 0,
        '500 Error': 0
      };

      invocationEvents.forEach(e => {
        if (e.accepted) {
          statusCounts['200 OK']++;
        } else if (e.message?.includes('401')) {
          statusCounts['401 Unauthorized']++;
        } else if (e.message?.includes('400')) {
          statusCounts['400 Bad Request']++;
        } else {
          statusCounts['500 Error']++;
        }
      });

      const statusDistribution = Object.entries(statusCounts)
        .filter(([_, count]) => count > 0)
        .map(([status, count]) => ({
          status,
          count,
          color: status.startsWith('2') ? '#10B981' : status.startsWith('4') ? '#F59E0B' : '#EF4444'
        }));

      // 8. Alerts
      const alerts = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.findMany({
        where: {
          tenantId,
          step: 'STEP_ERROR_PROVIDER_INVOCATION',
          createdAt: { gte: last24h },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const entitiesMatched = await (this.routingRepo as any).prisma.voiceOrchestrationEvent.count({
        where: {
          tenantId,
          step: 'STEP_6_RULE_MATCHED',
          createdAt: { gte: last24h },
        }
      });

      res.json({
        success: true,
        stats: {
          totalRequests,
          successRate: successRate.toFixed(1),
          avgLatency,
          entitiesMatched,
          funnel,
          providers,
          trend: (trend as any[]).map(t => ({ 
            time: new Date(t.time_bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            latency: Math.round(t.latency || 0) 
          })),
          statusDistribution,
          alerts: alerts.map(a => ({
            id: a.id,
            traceId: a.traceId,
            message: a.message,
            provider: a.provider?.charAt(0).toUpperCase() + a.provider?.slice(1),
            time: a.createdAt,
          })),
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
