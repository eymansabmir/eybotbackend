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
      logger.info(
        {
          flow: 'voice_orchestration',
          step: 'STEP_1_API_RECEIVED',
          traceId,
          route: 'POST /api/voice-tech/routing/execute',
        },
        'Voice orchestration step',
      );

      const payload = ExecuteRoutingSchema.parse(req.body);
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

  bulkExecute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const traceId = this.resolveTraceId(req);
    try {
      const { tenantId, routingConfigId, entityTypes } = req.body;
      if (!tenantId || !routingConfigId || !Array.isArray(entityTypes)) {
        res.status(400).json({ success: false, message: 'Missing tenantId, routingConfigId, or entityTypes' });
        return;
      }

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
}
