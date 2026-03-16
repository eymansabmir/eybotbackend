import { Router } from 'express';
import { CredentialController } from './credentials.controller';

export function createCredentialRouter(controller: CredentialController): Router {
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.patch('/:id/revoke', controller.revoke);
  router.delete('/:id', controller.remove);

  return router;
}
