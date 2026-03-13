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
  constructor(private readonly flowService: IFlowService) {}

  createFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = FlowSchema.parse(req.body);
      const flow = await this.flowService.createFlow(data);
      res.status(201).json(flow);
    } catch (err) { next(err); }
  };

  getFlowById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const flow = await this.flowService.getFlowById(req.params['id'] as string);
      res.json(flow);
    } catch (err) { next(err); }
  };

  getFlows = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, status } = FlowListQuerySchema.parse(req.query);
      const flows = await this.flowService.getFlowsByOrgId(orgId, status);
      res.json(flows);
    } catch (err) { next(err); }
  };

  updateFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const updates = pruneUndefined(FlowUpdateSchema.parse(req.body));
      const flow = await this.flowService.updateFlow(id, updates as any);
      res.json(flow);
    } catch (err) { next(err); }
  };

  publishFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const flow = await this.flowService.publishFlow(req.params['id'] as string);
      res.json(flow);
    } catch (err) { next(err); }
  };

  archiveFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const flow = await this.flowService.archiveFlow(req.params['id'] as string);
      res.json(flow);
    } catch (err) { next(err); }
  };

  deleteFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.flowService.deleteFlow(req.params['id'] as string);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
