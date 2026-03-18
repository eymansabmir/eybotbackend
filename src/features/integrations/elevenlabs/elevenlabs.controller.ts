import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { IElevenLabsIntegrationService } from '../../../plugins/elevenlabs';

const pickFirst = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const PathSchema = z.object({
  id: z.string().min(1),
});

const OrgBodySchema = z.object({
  orgId: z.string().min(1),
});

const ExecuteSpeechSchema = z.object({
  orgId: z.string().min(1),
  credentialId: z.string().min(1),
  voiceId: z.string().min(1),
  text: z.string().min(1),
  modelId: z.string().optional(),
  outputFormat: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export class ElevenLabsController {
  constructor(private readonly service: IElevenLabsIntegrationService) {}

  testCredential = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = PathSchema.parse(req.params);
      const { orgId } = OrgBodySchema.parse(req.body);
      const result = await this.service.testCredential(orgId, id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  listModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = z
        .object({
          orgId: z.preprocess(pickFirst, z.string().min(1)),
          credentialId: z.preprocess(pickFirst, z.string().min(1)),
        })
        .parse(req.query);

      logger.info(
        {
          orgId: query.orgId,
          credentialId: query.credentialId,
          action: 'listModels',
        },
        'STEP 2: Action received',
      );

      const models = await this.service.listModels(query.orgId, query.credentialId);
      res.json(models);
    } catch (error) {
      next(error);
    }
  };

  listVoices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = z
        .object({
          orgId: z.preprocess(pickFirst, z.string().min(1)),
          credentialId: z.preprocess(pickFirst, z.string().min(1)),
        })
        .parse(req.query);

      logger.info(
        {
          orgId: query.orgId,
          credentialId: query.credentialId,
          action: 'listVoices',
        },
        'STEP 2: Action received',
      );

      const voices = await this.service.listVoices(query.orgId, query.credentialId);
      res.json(voices);
    } catch (error) {
      next(error);
    }
  };

  createSpeech = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = ExecuteSpeechSchema.parse(req.body);
      const result = await this.service.executeNode(body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

}
