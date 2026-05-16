import { Router } from 'express';
import { ApiKeyController } from './api-key.controller';

export function createApiKeyManagementRouter(controller: ApiKeyController): Router {
  const router = Router();

  // Middleware to ensure user is logged in (session-based)
  router.use((req, res, next) => {
    if (!(req as any).auth) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    // Inject orgId into user for the controller
    const session = (req as any).auth;
    (req as any).user = {
      orgId: session.session.activeOrganizationId || session.user.id, // Fallback if no org
    };
    return next();
  });

  router.get('/', controller.listKeys);
  router.post('/', controller.createKey);
  router.delete('/:id', controller.revokeKey);

  return router;
}
