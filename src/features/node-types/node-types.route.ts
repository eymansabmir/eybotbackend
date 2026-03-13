import { Router } from 'express';
import { NodeTypesController } from './node-types.controller';

export function createNodeTypesRouter(controller: NodeTypesController): Router {
  const router = Router();
  router.get('/', controller.getNodeTypes);
  return router;
}
