import { Router } from 'express';
import { NocoDBController } from './nocodb.controller';

export function createNocoDBRouter(
  controller: NocoDBController
): Router {
  const router = Router();
  
  // Endpoint to test an existing NocoDB credential
  router.post('/credentials/:id/test', controller.testConnection);

  return router;
}
