import { Request, Response } from 'express';
import { z } from 'zod';
import type { WaFlowSurveyService } from '../application/wa-flow-survey.service';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);

const OrgQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string().min(1, 'orgId is required')),
});

const SubmissionsQuerySchema = OrgQuerySchema.extend({
  limit: z.preprocess(pickFirst, z.string().optional().transform((v) => (v ? parseInt(v, 10) : 50))),
  offset: z.preprocess(pickFirst, z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0))),
});

export class WaFlowSurveyController {
  constructor(private readonly service: WaFlowSurveyService) {}

  list = async (req: Request, res: Response) => {
    try {
      const { orgId } = OrgQuerySchema.parse(req.query);
      const surveys = await this.service.listSurveys(orgId);
      return res.json({ surveys });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || 'Validation error' });
      }
      logger.error({ error, query: req.query }, 'WaFlowSurvey: list failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  analytics = async (req: Request, res: Response) => {
    try {
      const { orgId } = OrgQuerySchema.parse(req.query);
      const surveyId = String(req.params['id'] ?? '');
      const analytics = await this.service.getAnalytics(orgId, surveyId);
      if (!analytics) return res.status(404).json({ error: 'Survey not found' });
      return res.json(analytics);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || 'Validation error' });
      }
      logger.error({ error, query: req.query }, 'WaFlowSurvey: analytics failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  submissions = async (req: Request, res: Response) => {
    try {
      const query = SubmissionsQuerySchema.parse(req.query);
      const surveyId = String(req.params['id'] ?? '');
      const result = await this.service.listSubmissions(
        query.orgId,
        surveyId,
        query.limit ?? 50,
        query.offset ?? 0,
      );
      return res.json(result);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0]?.message || 'Validation error' });
      }
      logger.error({ error, query: req.query }, 'WaFlowSurvey: submissions failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
