import { Router } from 'express';
import { StorageController } from './storage.controller';
import { upload } from '../../middleware/upload.middleware';

export function createStorageRouter(controller: StorageController): Router {
  const router = Router();
  router.post('/upload', upload.single('file'), controller.uploadFile);
  router.get('/presigned-url', controller.getPresignedUrl);
  router.get('/signed-url', controller.getSignedUrl);
  router.delete('/file', controller.deleteFile);
  return router;
}
