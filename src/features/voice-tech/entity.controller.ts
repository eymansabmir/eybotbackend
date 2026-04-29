import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { IRedisPlugin } from '../../plugins/redis';
import { EXCHANGES, type IWorkerPlugin } from '../../plugins/worker';
import type { VoiceIngestJob } from '../../plugins/worker/jobs';
import type { IEntityRepository } from './data/entity.repository';
import type { IVoiceRoutingRepository } from './data/routing.repository';
import type { IngestionService } from './services/ingestion.service';
import {
  IngestEntitiesSchema,
  IngestFileSchema,
  ListAttributesSchema,
  VoiceIngestStatusSchema,
  UpsertAttributeSchema,
  DEFAULT_OPERATORS_BY_TYPE,
} from './domain/voice-tech.schemas';

const JOB_STATUS_PREFIX = 'voice:ingest:job:';
const JOB_STATUS_TTL_SECONDS = 60 * 60 * 24;

export class VoiceEntityController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly entityRepo: IEntityRepository,
    private readonly routingRepo: IVoiceRoutingRepository,
    private readonly workerPlugin: IWorkerPlugin,
    private readonly redisPlugin: IRedisPlugin,
  ) {}

  ingestRecords = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = IngestEntitiesSchema.parse(req.body);
      const result = await this.ingestionService.process(payload);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  };

  ingestFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = IngestFileSchema.parse(req.body);
      const result = await this.ingestionService.processFromFile(payload);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  };

  ingestRecordsAsync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = IngestEntitiesSchema.parse(req.body);
      const jobId = randomUUID();
      const job: VoiceIngestJob = {
        jobId,
        tenantId: payload.tenantId,
        entityType: payload.entityType,
        records: payload.records,
        retryCount: 0,
      };

      await this.redisPlugin.client.set(
        `${JOB_STATUS_PREFIX}${jobId}`,
        JSON.stringify({
          status: 'queued',
          tenantId: payload.tenantId,
          entityType: payload.entityType,
          updatedAt: new Date().toISOString(),
        }),
        'EX',
        JOB_STATUS_TTL_SECONDS,
      );

      await this.workerPlugin.publish(EXCHANGES.VOICE_INGEST, job);
      res.status(202).json({ success: true, jobId, status: 'queued' });
    } catch (err) {
      next(err);
    }
  };

  ingestFileAsync = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = IngestFileSchema.parse(req.body);
      const jobId = randomUUID();
      const job: VoiceIngestJob = {
        jobId,
        tenantId: payload.tenantId,
        entityType: payload.entityType,
        filePath: payload.filePath,
        retryCount: 0,
      };

      await this.redisPlugin.client.set(
        `${JOB_STATUS_PREFIX}${jobId}`,
        JSON.stringify({
          status: 'queued',
          tenantId: payload.tenantId,
          entityType: payload.entityType,
          updatedAt: new Date().toISOString(),
        }),
        'EX',
        JOB_STATUS_TTL_SECONDS,
      );

      await this.workerPlugin.publish(EXCHANGES.VOICE_INGEST, job);
      res.status(202).json({ success: true, jobId, status: 'queued' });
    } catch (err) {
      next(err);
    }
  };

  getIngestJobStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = VoiceIngestStatusSchema.parse(req.params);
      const value = await this.redisPlugin.client.get(`${JOB_STATUS_PREFIX}${payload.jobId}`);
      if (!value) {
        res.status(404).json({ success: false, message: 'Ingestion job not found' });
        return;
      }

      res.json({ success: true, jobId: payload.jobId, ...(JSON.parse(value) as Record<string, unknown>) });
    } catch (err) {
      next(err);
    }
  };

  listAttributes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = ListAttributesSchema.parse(req.query);
      const attributes = await this.entityRepo.listAttributes(payload.tenantId, payload.entityType);
      res.json({
        success: true,
        tenantId: payload.tenantId,
        entityType: payload.entityType,
        attributes,
      });
    } catch (err) {
      next(err);
    }
  };

  listEntityTypes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = (req.params.tenantId || req.query.tenantId) as string;
      if (!tenantId) {
        res.status(400).json({ success: false, message: 'Missing tenantId' });
        return;
      }
      const types = await this.entityRepo.listEntityTypes(tenantId);
      res.json({ success: true, types });
    } catch (err) {
      next(err);
    }
  };

  deleteEntityType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = (req.body?.tenantId || req.query?.tenantId) as string;
      const name = req.params.name as string;
      if (!tenantId || !name) {
        res.status(400).json({ success: false, message: 'Missing tenantId or entityType name' });
        return;
      }

      // 1. Delete associated stack (RoutingConfig) if exists
      let associatedStackId: string | null = null;
      if (this.routingRepo && typeof this.routingRepo.findConfigByName === 'function') {
        associatedStackId = await this.routingRepo.findConfigByName(name, tenantId);
        if (associatedStackId) {
          await this.routingRepo.deleteConfig(associatedStackId, tenantId);
        }
      }

      // 2. Delete the dataset (EntityType)
      await this.entityRepo.deleteEntityType(tenantId, name);

      res.json({ 
        success: true, 
        message: associatedStackId 
          ? `Dataset "${name}" and its associated stack were deleted` 
          : `Dataset "${name}" deleted` 
      });
    } catch (err) {
      next(err);
    }
  };

  upsertAttribute = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = UpsertAttributeSchema.parse(req.body);
      
      const entityTypeId = await this.entityRepo.findEntityTypeId(payload.tenantId, payload.entityType);
      if (!entityTypeId) {
        res.status(404).json({ success: false, message: `Dataset "${payload.entityType}" not found` });
        return;
      }

      await this.entityRepo.upsertAttribute({
        tenantId: payload.tenantId,
        entityTypeId,
        key: payload.key,
        type: payload.type,
        operators: (payload.operators && payload.operators.length > 0) 
          ? payload.operators 
          : (DEFAULT_OPERATORS_BY_TYPE[payload.type] || []),
        values: payload.values || [],
      });

      await this.entityRepo.invalidateAttributesCache(payload.tenantId, payload.entityType);

      res.json({ success: true, message: `Attribute "${payload.key}" upserted` });
    } catch (err) {
      next(err);
    }
  };
}