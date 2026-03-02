import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';

export function createContactRouter(contactController: ContactController): Router {
  const router = Router();

  router.post('/', contactController.createContact);
  router.get('/', contactController.getContacts);
  router.get('/:id', contactController.getContactById);
  router.put('/:id', contactController.updateContact);
  router.delete('/:id', contactController.deleteContact);

  return router;
}
