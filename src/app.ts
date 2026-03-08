import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { Container } from './container';
import { createFlowRouter } from './routes/flows.route';
import { createContactRouter } from './routes/contacts.route';
import { createNodeTypesRouter } from './routes/node-types.route';
import { createWhatsAppWebhookRouter } from './routes/whatsapp-webhook.route';
import { createChatSessionRouter } from './routes/chat-sessions.route';
import { createStorageRouter } from './routes/storage.route';
import { errorHandler } from './middleware/error.middleware';

export function createApp(): Application {
  const app = express();
  const container = Container.getInstance();
  const WEBHOOK_URL = process.env.WEBHOOK_URL;

  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/flows', createFlowRouter(container.flowController));
  app.use('/api/contacts', createContactRouter(container.contactController));
  app.use('/api/node-types', createNodeTypesRouter(container.nodeTypesController));
  app.use(`/api/v1/${WEBHOOK_URL}`, createWhatsAppWebhookRouter(container.whatsappWebhookController));
  app.use('/api/webhooks/whatsapp', createWhatsAppWebhookRouter(container.whatsappWebhookController));
  app.use('/api/chat-sessions', createChatSessionRouter(container.chatSessionController));
  app.use('/api/storage', createStorageRouter(container.storageController));

  app.use(errorHandler);

  return app;
}
