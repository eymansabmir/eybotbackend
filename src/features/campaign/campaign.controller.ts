import { Request, Response, NextFunction } from 'express';
import { CampaignService } from './campaign.service';

export class CampaignController {
  constructor(private readonly service: CampaignService) {}

  list = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT
      logger.debug({ orgId }, 'Listing campaigns');
      const campaigns = await this.service.listCampaigns(orgId);
      res.json(campaigns);
    } catch (error) {
      logger.error({ error }, 'Failed to list campaigns');
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT
      const { name, flowId, filePath, scheduleTime } = req.body;

      logger.info({ orgId, name, flowId }, 'Campaign create request received');

      const payload: Parameters<typeof this.service.createCampaign>[0] = {
        orgId,
        name,
        flowId,
        filePath,
      };

      if (scheduleTime && scheduleTime !== 'null') {
        const date = new Date(scheduleTime);
        if (!isNaN(date.getTime())) {
          payload.scheduleTime = date;
        }
      }

      const result = await this.service.createCampaign(payload);

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

  getStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      logger.debug({ campaignId: id }, 'Fetching campaign stats');
      const result = await this.service.getCampaignStats(id as string);
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch campaign stats');
      next(error);
    }
  };

  start = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT

      logger.info({ campaignId: id, orgId }, 'Starting campaign');
      const result = await this.service.startCampaign(id as string, orgId);

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to start campaign');
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT
      logger.info({ campaignId: id, orgId }, 'Cancelling campaign');
      const result = await this.service.cancelCampaign(id as string, orgId);
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to cancel campaign');
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT
      logger.info({ campaignId: id }, 'Deleting campaign');
      await this.service.deleteCampaign(id as string, orgId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Failed to delete campaign');
      next(error);
    }
  };
}
