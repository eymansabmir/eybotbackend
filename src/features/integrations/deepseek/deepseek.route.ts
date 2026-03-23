import { Router } from 'express';
import { DeepSeekController } from './deepseek.controller';

export function createDeepSeekRouter(controller: DeepSeekController): Router {
  const router = Router();

  // Test credential connection
  router.post('/test', controller.testConnection);

  // List models
  router.get('/models', controller.listModels);

  // Preview Prompt Generation
  router.post('/preview', controller.preview);

  return router;
}
