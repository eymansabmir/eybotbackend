import { Router } from 'express';
import { AnthropicController } from './anthropic.controller';

export function createAnthropicRouter(controller: AnthropicController): Router {
  const router = Router();

  // Test credential connection
  router.post('/test', controller.testConnection);

  // List models
  router.get('/models', controller.listModels);

  // Preview Prompt Generation
  router.post('/preview', controller.preview);

  return router;
}
