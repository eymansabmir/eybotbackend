import { Router } from 'express';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

export function createWhatsAppWebhookRouter(controller: WhatsAppWebhookController): Router {
  const router = Router();
  router.get('/', controller.verify);
  router.post('/', controller.handle);
  router.post('/webhook', controller.handle);
  router.get('/:orgId', controller.verify);
  router.post('/:orgId', controller.handle);
  return router;
}
