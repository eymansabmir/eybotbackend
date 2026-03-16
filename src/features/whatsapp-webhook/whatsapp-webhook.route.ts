import { Router } from 'express';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

export function createWhatsAppWebhookRouter(controller: WhatsAppWebhookController): Router {
  const router = Router();
  router.get('/:orgId', controller.verify);
  router.post('/:orgId', controller.handle);
  router.post('/webhook', controller.handle);
  return router;
}
