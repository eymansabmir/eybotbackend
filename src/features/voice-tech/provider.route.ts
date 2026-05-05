import { Router } from 'express';
import type { VoiceProviderController } from './provider.controller';

export function createVoiceProviderRouter(controller: VoiceProviderController): Router {
  const router = Router();

  router.get('/', controller.listAgents);
  router.post('/', controller.upsertAgent);
  router.delete('/:id', controller.deleteAgent);

  return router;
}
