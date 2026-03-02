import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { IFlowService } from '../services/flow.service';
import { Flow, FlowSchema, FlowStatusSchema } from '../schemas/flow.schema';
import { pruneUndefined } from '../utils/object';

const pickFirstQueryValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const QueryStringSchema = z.preprocess(pickFirstQueryValue, z.string());
const QueryStatusSchema = z.preprocess(pickFirstQueryValue, FlowStatusSchema);

const FlowUpdateSchema = FlowSchema.partial();

const FlowListQuerySchema = z.object({
  orgId: QueryStringSchema,
  status: QueryStatusSchema.optional(),
});

export class FlowController {
  constructor(private readonly flowService: IFlowService) {}

  createFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = FlowSchema.parse(req.body);
      const flow = await this.flowService.createFlow(validatedData);
      res.status(201).json(flow);
    } catch (error) {
      next(error);
    }
  };

  getFlowById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const flow = await this.flowService.getFlowById(id);
      res.json(flow);
    } catch (error) {
      next(error);
    }
  };

  getFlows = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId, status } = FlowListQuerySchema.parse(req.query);
      const flows = await this.flowService.getFlowsByOrgId(orgId, status);
      res.json(flows);
    } catch (error) {
      next(error);
    }
  };

  updateFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const parsedUpdates = FlowUpdateSchema.parse(req.body) as Partial<Flow>;
      const updates = pruneUndefined<Flow>(parsedUpdates);
      const flow = await this.flowService.updateFlow(id, updates);
      res.json(flow);
    } catch (error) {
      next(error);
    }
  };

  publishFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const flow = await this.flowService.publishFlow(id);
      res.json(flow);
    } catch (error) {
      next(error);
    }
  };

  archiveFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const flow = await this.flowService.archiveFlow(id);
      res.json(flow);
    } catch (error) {
      next(error);
    }
  };

  deleteFlow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.flowService.deleteFlow(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
