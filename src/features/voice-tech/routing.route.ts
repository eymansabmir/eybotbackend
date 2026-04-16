import { Router } from 'express';
import type { VoiceRoutingController } from './routing.controller';

export function createVoiceRoutingRouter(controller: VoiceRoutingController): Router {
  const router = Router();

  router.get('/', controller.listConfigs);
  router.post('/', controller.createConfig);
  router.get('/:id', controller.getConfig);
  router.post('/execute', controller.executeRouting);
  router.post('/query', controller.queryEntitiesByRule);
  router.post('/rules', controller.upsertRule);
  router.delete('/rules/:id', controller.deleteRule);

  return router;
}

