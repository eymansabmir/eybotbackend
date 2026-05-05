import { Router } from 'express';
import type { ExotelCallbackController } from './exotel-callback.controller';

export function createExotelCallbackRouter(controller: ExotelCallbackController): Router {
  const router = Router();

  router.post('/callback', controller.handle);
  router.get('/callback', controller.handle);

  return router;
}
