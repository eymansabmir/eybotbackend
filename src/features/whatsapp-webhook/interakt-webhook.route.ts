import { Router } from 'express';
import { InteraktWebhookController } from './interakt-webhook.controller';

export function createInteraktWebhookRouter(controller: InteraktWebhookController): Router {
  const router = Router();
  router.post('/', controller.handle);
  router.post('/webhook', controller.handle);
  router.post('/:orgId', controller.handle);
  return router;
}
