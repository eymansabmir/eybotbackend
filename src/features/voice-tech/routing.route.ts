import { Router } from 'express';
import type { VoiceRoutingController } from './routing.controller';

export function createVoiceRoutingRouter(controller: VoiceRoutingController): Router {
  const router = Router();

  router.get('/', controller.listConfigs);
  router.get('/:id', controller.getConfig);
  router.post('/execute', controller.executeRouting);
  router.post('/query', controller.queryEntitiesByRule);

  return router;
}

