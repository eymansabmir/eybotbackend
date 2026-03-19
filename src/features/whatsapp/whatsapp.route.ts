import { Router } from 'express';
import { WhatsAppController } from './whatsapp.controller';

export function createWhatsAppRouter(controller: WhatsAppController): Router {
  const router = Router();
  router.post('/upload-media', controller.uploadMedia);
  return router;
}
