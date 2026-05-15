import { Router } from 'express';
import { DataSourceController } from './data-source.controller';
import { SyncJobController } from './sync-job.controller';

export function createConnectorRouter(
  dsController: DataSourceController,
  sjController: SyncJobController
): Router {
  const router = Router();

  // DataSources
  router.post('/data-sources', dsController.create);
  router.get('/data-sources', dsController.list);
  router.delete('/data-sources/:id', dsController.delete);

  // Sync Jobs
  router.post('/sync-jobs', sjController.create);
  router.get('/sync-jobs', sjController.list);
  router.post('/sync-jobs/:id/run', sjController.runNow);
  router.delete('/sync-jobs/:id', sjController.delete);

  return router;
}
