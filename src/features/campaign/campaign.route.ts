import { Router } from 'express';
import { CampaignController } from './campaign.controller';

export function createCampaignRouter(controller: CampaignController): Router {
  const router = Router();

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/:id/start', controller.start);
  router.post('/:id/cancel', controller.cancel);
  router.get('/:id/stats', controller.getStats);
  router.delete('/:id', controller.delete);
  router.get('/:id', controller.get);

  return router;
}
