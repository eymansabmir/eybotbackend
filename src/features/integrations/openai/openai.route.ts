import { Router } from 'express';
import { OpenAIController } from './openai.controller';
import { upload } from '../../../middleware/upload.middleware';

export function createOpenAIRouter(controller: OpenAIController): Router {
  const router = Router();

  router.get('/models', controller.listModels);
  router.post('/preview', controller.preview);
  router.get('/voice/models', controller.listSpeechModels);
  router.post('/voice/speech', controller.createSpeech);
  router.post('/voice/transcription', upload.single('audioFile'), controller.createTranscription);
  router.post('/credentials/:id/test', controller.testCredential);

  return router;
}
