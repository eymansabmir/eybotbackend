import { Router } from 'express';
import type { VoiceEntityController } from './entity.controller';

export function createVoiceEntityRouter(controller: VoiceEntityController): Router {
  const router = Router();

  router.post('/ingest', controller.ingestRecords);
  router.post('/ingest-file', controller.ingestFile);
  router.post('/ingest/async', controller.ingestRecordsAsync);
  router.post('/ingest-file/async', controller.ingestFileAsync);
  router.get('/ingest/jobs/:jobId', controller.getIngestJobStatus);
  router.get('/attributes', controller.listAttributes);

  return router;
}
