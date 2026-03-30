import { Router } from 'express';
import { HttpRequestController } from './http-request.controller';

export function createHttpRequestRouter(controller: HttpRequestController): Router {
  const router = Router();

  router.post('/preview', controller.preview);

  return router;
}
