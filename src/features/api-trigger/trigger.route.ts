import { Router } from 'express';
import { TriggerController } from './trigger.controller';

export function createTriggerRouter(controller: TriggerController): Router {
  const router = Router();
  
  /**
   * @route POST /api/v1/trigger
   * @desc Trigger a bot for a batch of recipients
   * @access Authenticated (Org)
   */
  router.post('/', controller.trigger);
  
  return router;
}
