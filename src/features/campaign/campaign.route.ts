import { Router } from 'express';
import { CampaignController } from './campaign.controller';

export function createCampaignRouter(controller: CampaignController): Router {
  const router = Router();

  router.post('/', controller.create);
  router.get('/:id', controller.get);

  return router;
}
