import { Router } from 'express';
import { ActivityLogController } from './activity-log.controller';

export function createActivityLogRouter(controller: ActivityLogController): Router {
  const router = Router();

  router.get('/', (req, res) => controller.getLogs(req, res));
  router.get('/:id', (req, res) => controller.getLogById(req, res));

  return router;
}
