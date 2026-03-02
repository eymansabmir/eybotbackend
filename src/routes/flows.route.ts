import { Router } from 'express';
import { FlowController } from '../controllers/flow.controller';

export function createFlowRouter(flowController: FlowController): Router {
  const router = Router();

  router.post('/', flowController.createFlow);
  router.get('/', flowController.getFlows);
  router.get('/:id', flowController.getFlowById);
  router.put('/:id', flowController.updateFlow);
  router.post('/:id/publish', flowController.publishFlow);
  router.post('/:id/archive', flowController.archiveFlow);
  router.delete('/:id', flowController.deleteFlow);

  return router;
}
