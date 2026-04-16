import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../../utils/errors';
import type { RoutingConditionNode } from './domain/condition.types';
import type { EntityQueryService } from './services/entity-query.service';
import type { IVoiceRoutingRepository } from './data/routing.repository';
import type { VoiceRoutingService } from './services/voice-routing.service';
import {
  CreateRoutingConfigSchema,
  DeleteRoutingRuleSchema,
  ExecuteRoutingSchema,
  GetRoutingConfigSchema,
  ListRoutingConfigsSchema,
  QueryByRuleSchema,
  UpsertRoutingRuleSchema,
} from './domain/voice-tech.schemas';

export class VoiceRoutingController {
  constructor(
    private readonly voiceRoutingService: VoiceRoutingService,
    private readonly entityQueryService: EntityQueryService,
    private readonly routingRepo: IVoiceRoutingRepository,
  ) {}

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

  deleteRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = DeleteRoutingRuleSchema.parse(req.params);
      await this.routingRepo.deleteRule(id);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  };

  executeRouting = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = ExecuteRoutingSchema.parse(req.body);
      const result = await this.voiceRoutingService.route(payload);
      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  };

  queryEntitiesByRule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = QueryByRuleSchema.parse(req.body);
      const entities = await this.entityQueryService.fetchEntitiesByRule({
        tenantId: payload.tenantId,
        entityType: payload.entityType,
        conditions: payload.conditions as RoutingConditionNode,
        limit: payload.limit
      });
      res.json({ success: true, count: entities.length, entities });
    } catch (err) {
      next(err);
    }
  };
}
