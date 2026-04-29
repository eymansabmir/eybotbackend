import type { NextFunction, Request, Response } from 'express';
import type { IVoiceRoutingRepository } from './data/routing.repository';
import {
  ListVoiceProvidersSchema,
  UpsertVoiceProviderSchema,
} from './domain/voice-tech.schemas';

export class VoiceProviderController {
  constructor(
    private readonly routingRepo: IVoiceRoutingRepository,
  ) { }

  listAgents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = ListVoiceProvidersSchema.parse({ ...req.query, ...req.params });
      const agents = await this.routingRepo.listVoiceAgents(payload.tenantId, payload.credentialId);
      res.json({ success: true, agents });
    } catch (err) {
      next(err);
    }
  };

  upsertAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = UpsertVoiceProviderSchema.parse(req.body);
      const agent = await this.routingRepo.upsertVoiceAgent(payload);
      res.status(200).json({ success: true, agent });
    } catch (err) {
      next(err);
    }
  };

  deleteAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const tenantId = req.query.tenantId as string;
      if (!id || !tenantId) {
        res.status(400).json({ success: false, message: 'Missing id or tenantId' });
        return;
      }
      await this.routingRepo.deleteVoiceAgent(id, tenantId);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  };
}
