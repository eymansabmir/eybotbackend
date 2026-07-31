import { Router } from 'express';
import type { WaFlowSurveyController } from './wa-flow-survey.controller';

export function createWaFlowSurveyRouter(controller: WaFlowSurveyController): Router {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:id/analytics', controller.analytics);
  router.get('/:id/submissions', controller.submissions);
  return router;
}
