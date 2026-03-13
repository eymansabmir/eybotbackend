import { Request, Response, NextFunction } from 'express';
import { CampaignService } from './campaign.service';

export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT
      const { name, flowId, filePath, scheduleTime } = req.body;

      logger.info({ orgId, name, flowId }, 'Campaign create request received');

      const result = await this.service.createCampaign({
        orgId,
        name,
        flowId,
        filePath,
        scheduleTime: scheduleTime ? new Date(scheduleTime) : new Date(),
      });

      logger.info({ campaignId: result.campaign.id }, 'Campaign created successfully');
      res.status(201).json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to create campaign');
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      logger.debug({ campaignId: id }, 'Fetching campaign');
      const campaign = await this.service.getCampaign(id as string);
      if (!campaign) {
        logger.warn({ campaignId: id }, 'Campaign not found');
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      res.json(campaign);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch campaign');
      next(error);
    }
  };
}
