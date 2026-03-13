import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import type { IPluginRegistry } from './plugins/plugin.interface';
import { DATABASE_PLUGIN, type IDatabasePlugin } from './plugins/database';
import { ENGINE_PLUGIN, type IEnginePlugin } from './plugins/engine';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from './plugins/whatsapp';
import { WORKER_PLUGIN, type IWorkerPlugin } from './plugins/worker';
import { STORAGE_PLUGIN, type IStoragePlugin } from './plugins/storage';

import { PrismaFlowRepository } from './features/flow/flow.repository';
import { PrismaContactRepository } from './features/contact/contact.repository';
import { PrismaSessionRepository } from './features/session/session.repository';

import { FlowService } from './features/flow/flow.service';
import { ContactService } from './features/contact/contact.service';
import { SessionService } from './features/session/session.service';

import { FlowController } from './features/flow/flow.controller';
import { ContactController } from './features/contact/contact.controller';
import { SessionController } from './features/session/session.controller';
import { NodeTypesController } from './features/node-types/node-types.controller';
import { WhatsAppWebhookController } from './features/whatsapp-webhook/whatsapp-webhook.controller';
import { StorageController } from './features/storage/storage.controller';

import { createFlowRouter } from './features/flow/flow.route';
import { createContactRouter } from './features/contact/contact.route';
import { createSessionRouter } from './features/session/session.route';
import { createNodeTypesRouter } from './features/node-types/node-types.route';
import { createWhatsAppWebhookRouter } from './features/whatsapp-webhook/whatsapp-webhook.route';
import { createStorageRouter } from './features/storage/storage.route';

import { errorHandler } from './middleware/error.middleware';

export function createApp(registry: IPluginRegistry): Application {
  const app = express();
  const WEBHOOK_URL = process.env.WEBHOOK_URL;

  app.use(helmet());
  app.use(cors());
  app.use(morgan('combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Resolve plugins ──────────────────────────────────────────────────────────
  const dbPlugin = registry.get<IDatabasePlugin>(DATABASE_PLUGIN);
  const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const whatsappPlugin = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  const storagePlugin = registry.get<IStoragePlugin>(STORAGE_PLUGIN);

  // ── Repositories ────────────────────────────────────────────────────────────
  const flowRepo = new PrismaFlowRepository(dbPlugin.prisma);
  const contactRepo = new PrismaContactRepository(dbPlugin.prisma);
  const sessionRepo = new PrismaSessionRepository(dbPlugin.prisma);

  // ── Services ────────────────────────────────────────────────────────────────
  const flowService = new FlowService(flowRepo);
  const contactService = new ContactService(contactRepo);
  const sessionService = new SessionService(sessionRepo, flowRepo, contactRepo, enginePlugin, whatsappPlugin);

  // ── Controllers ─────────────────────────────────────────────────────────────
  const flowController = new FlowController(flowService);
  const contactController = new ContactController(contactService);
  const sessionController = new SessionController(sessionService);
  const nodeTypesController = new NodeTypesController();
  const webhookController = new WhatsAppWebhookController(whatsappPlugin, workerPlugin);
  const storageController = new StorageController(storagePlugin);

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.use('/api/flows', createFlowRouter(flowController));
  app.use('/api/contacts', createContactRouter(contactController));
  app.use('/api/chat-sessions', createSessionRouter(sessionController));
  app.use('/api/node-types', createNodeTypesRouter(nodeTypesController));
  app.use('/api/storage', createStorageRouter(storageController));

  if (WEBHOOK_URL) {
    app.use(`/api/v1/${WEBHOOK_URL}`, createWhatsAppWebhookRouter(webhookController));
  }
  app.use('/api/webhooks/whatsapp', createWhatsAppWebhookRouter(webhookController));

  app.use(errorHandler);

  return app;
}
