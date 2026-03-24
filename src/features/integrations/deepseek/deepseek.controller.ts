import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../../utils/errors';
import type { IDeepSeekIntegrationService } from '../../../plugins/deepseek';

const OrgParamsSchema = z.object({
  orgId: z.string(),
});

const CredentialParamsSchema = OrgParamsSchema.extend({
  credentialId: z.string(),
});

const PreviewParamsSchema = OrgParamsSchema.extend({
  credentialId: z.string(),
  model: z.string(),
  prompt: z.string().optional(),
  messages: z.array(z.any()).optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  timeoutMs: z.number().optional(),
});

export class DeepSeekController {
  constructor(private readonly service: IDeepSeekIntegrationService) {}

  testConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId } = CredentialParamsSchema.parse(req.body);
      const result = await this.service.testCredential(orgId, credentialId);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('Invalid request parameters', 400));
      }
      next(error);
    }
  };

  listModels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, credentialId } = CredentialParamsSchema.parse(req.query);
      await this.service.testCredential(orgId, credentialId);
      
      const models = await this.service.listModels();
      res.json(models);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('Invalid request parameters', 400));
      }
      next(error);
    }
  };

  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = PreviewParamsSchema.parse(req.body);
      const result = await this.service.preview(payload as any);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new AppError('Invalid request parameters', 400));
      }
      next(error);
    }
  };
}
