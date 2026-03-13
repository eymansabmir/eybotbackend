import { Request, Response, NextFunction } from 'express';
import { CampaignService } from './campaign.service';

export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT
      const { name, flowId, filePath, scheduleTime } = req.body;

      const result = await this.service.createCampaign({
        orgId,
        name,
        flowId,
        filePath,
        scheduleTime: scheduleTime ? new Date(scheduleTime) : new Date(),
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const campaign = await this.service.getCampaign(id as string);
      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      res.json(campaign);
    } catch (error) {
      next(error);
    }
  };
}
