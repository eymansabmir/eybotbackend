import { Router } from 'express';
import { ChatSessionController } from '../chat-session/chat-session.controller';

export function createChatSessionRouter(controller: ChatSessionController): Router {
  const router = Router();

  router.post('/', controller.startFlow);
  router.post('/:sessionId/resume', controller.resumeFlow);
  router.get('/:sessionId', controller.getSession);

  return router;
}
