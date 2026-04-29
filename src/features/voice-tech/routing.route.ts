import { Router } from 'express';
import type { VoiceRoutingController } from './routing.controller';

export function createVoiceRoutingRouter(controller: VoiceRoutingController): Router {
  const router = Router();

  router.get('/analytics/orchestration', controller.getOrchestrationStats);
  router.get('/', controller.listConfigs);
  router.post('/', controller.createConfig);
  router.post('/execute', controller.executeRouting);
  router.post('/bulk-execute', controller.bulkExecute);
  router.get('/bulk-execute/jobs/:jobId', controller.getBulkExecuteStatus);
  router.post('/query-entities', controller.queryEntitiesByRule);
  router.post('/rules', controller.upsertRule);
  router.post('/rules/toggle-active', controller.toggleRuleActive);
  router.delete('/rules/:id', controller.deleteRule);
  router.get('/:id', controller.getConfig);
  router.patch('/:id', controller.updateConfig);
  router.delete('/:id', controller.deleteConfig);

  return router;
}

