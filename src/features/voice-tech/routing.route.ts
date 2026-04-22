import { Router } from 'express';
import type { VoiceRoutingController } from './routing.controller';

export function createVoiceRoutingRouter(controller: VoiceRoutingController): Router {
  const router = Router();

  router.get('/analytics/orchestration', controller.getOrchestrationStats);
  router.get('/', controller.listConfigs);
  router.post('/', controller.createConfig);
  router.get('/:id', controller.getConfig);
  router.post('/execute', controller.executeRouting);
  router.post('/bulk-execute', controller.bulkExecute);
  router.post('/query-entities', controller.queryEntitiesByRule);
  router.post('/rules', controller.upsertRule);
  router.post('/rules/toggle-active', controller.toggleRuleActive);
  router.delete('/rules/:id', controller.deleteRule);
  router.delete('/:id', controller.deleteConfig);

  return router;
}

