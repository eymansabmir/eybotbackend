import { Router } from 'express';
import { SessionController } from './session.controller';

export function createSessionRouter(controller: SessionController): Router {
  const router = Router();
  router.post('/', controller.startFlow);
  router.post('/:sessionId/resume', controller.resumeFlow);
  router.get('/:sessionId', controller.getSession);
  return router;
}
