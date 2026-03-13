import { Router } from 'express';
import { ContactController } from './contact.controller';

export function createContactRouter(controller: ContactController): Router {
  const router = Router();
  router.post('/', controller.createContact);
  router.get('/', controller.getContacts);
  router.get('/:id', controller.getContactById);
  router.put('/:id', controller.updateContact);
  router.delete('/:id', controller.deleteContact);
  return router;
}
