import { Router } from 'express';
import { FlowController } from './flow.controller';

export function createFlowRouter(controller: FlowController): Router {
  const router = Router();
  router.post('/', controller.createFlow);
  router.get('/', controller.getFlows);
  router.get('/:id', controller.getFlowById);
  router.put('/:id', controller.updateFlow);
  router.post('/:id/publish', controller.publishFlow);
  router.post('/:id/configure', controller.configureFlow);
  router.post('/:id/sync-translations', controller.syncTranslations);
  router.get('/:id/translations/:language', controller.getFlowTranslation);
  router.put('/:id/translations/:language', controller.updateFlowTranslation);
  router.post('/:id/archive', controller.archiveFlow);
  router.delete('/:id', controller.deleteFlow);
  return router;
}
