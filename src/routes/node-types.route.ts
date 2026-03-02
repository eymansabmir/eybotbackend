import { Router } from 'express';
import { NodeTypesController } from '../controllers/node-types.controller';

export function createNodeTypesRouter(nodeTypesController: NodeTypesController): Router {
  const router = Router();

  router.get('/', nodeTypesController.getNodeTypes);

  return router;
}
