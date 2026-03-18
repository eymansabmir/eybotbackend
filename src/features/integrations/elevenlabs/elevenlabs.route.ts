import { Router } from 'express';
import { ElevenLabsController } from './elevenlabs.controller';

export function createElevenLabsRouter(controller: ElevenLabsController): Router {
  const router = Router();

  router.get('/models', controller.listModels);
  router.get('/voices', controller.listVoices);
  router.post('/speech', controller.createSpeech);
  router.post('/credentials/:id/test', controller.testCredential);

  return router;
}
