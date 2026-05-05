import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { IFlowService } from './flow.service';
import { FlowSchema, FlowStatusSchema } from '../../schemas/flow.schema';
import { pruneUndefined } from '../../utils/object';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const QueryStatusSchema = z.preprocess(pickFirst, FlowStatusSchema.optional());
const FlowListQuerySchema = z.object({
  orgId: z.preprocess(pickFirst, z.string()),
  status: QueryStatusSchema,
});
const FlowUpdateSchema = FlowSchema.partial();

export class FlowController {
  constructor(private readonly flowService: IFlowService) { }

  createFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = FlowSchema.parse(req.body);
      logger.info({ orgId: data.orgId, name: data.name }, 'Creating flow');
      const flow = await this.flowService.createFlow(data);
      logger.info({ flowId: flow.id }, 'Flow created');
      res.status(201).json(flow);
    } catch (err) { next(err); }
  };

  getFlowById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      logger.debug({ flowId: id }, 'Fetching flow by id');
      const flow = await this.flowService.getFlowById(id);
      res.json(flow);
    } catch (err) { next(err); }
  };

  getFlows = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, status } = FlowListQuerySchema.parse(req.query);
      logger.debug({ orgId, status }, 'Listing flows');
      const flows = await this.flowService.getFlowsByOrgId(orgId, status);
      res.json(flows);
    } catch (err) { next(err); }
  };

  updateFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const updates = pruneUndefined(FlowUpdateSchema.parse(req.body));
      logger.info({ flowId: id, updates }, 'Updating flow');
      const flow = await this.flowService.updateFlow(id, updates as any);
      res.json(flow);
    } catch (err) { next(err); }
  };

  publishFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      logger.info({ flowId: id }, 'Publishing flow');
      const flow = await this.flowService.publishFlow(id);
      logger.info({ flowId: id }, 'Flow published');
      res.json(flow);
    } catch (err) { next(err); }
  };

  configureFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { triggerConfig, isConfigured, credentials } = req.body;
      logger.info({ flowId: id }, 'Configuring and Publishing Flow');
      
      const payload = {
        triggerConfig,
        isConfigured: isConfigured !== undefined ? isConfigured : undefined
      };
      
      const flow = await this.flowService.configureFlow(id, payload, credentials);
      res.json(flow);
    } catch (err) { next(err); }
  };

  archiveFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      logger.info({ flowId: id }, 'Archiving flow');
      const flow = await this.flowService.archiveFlow(id);
      res.json(flow);
    } catch (err) { next(err); }
  };

  deleteFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      logger.info({ flowId: id }, 'Deleting flow');
      await this.flowService.deleteFlow(id);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  syncTranslations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const { nodes } = req.body;
      logger.info({ flowId: id, hasProvidedNodes: !!nodes }, 'Synchronizing translations for flow');
      await this.flowService.syncTranslations(id, nodes);
      res.status(200).json({ success: true, message: 'Translations synchronized successfully' });
    } catch (err) { next(err); }
  };

  getFlowTranslation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const language = req.params['language'] as string;
      logger.info({ flowId: id, language }, 'Fetching flow translation');
      const translation = await this.flowService.getFlowTranslation(id, language);
      res.json(translation);
    } catch (err) { next(err); }
  };

  updateFlowTranslation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const language = req.params['language'] as string;
      const { translatedData } = req.body;
      logger.info({ flowId: id, language }, 'Updating flow translation');
      await this.flowService.updateFlowTranslation(id, language, translatedData);
      res.json({ success: true });
    } catch (err) { next(err); }
  };
}
