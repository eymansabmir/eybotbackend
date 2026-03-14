import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import type { IPluginRegistry } from './plugins/plugin.interface';
import { ENGINE_PLUGIN, type IEnginePlugin } from './plugins/engine';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from './plugins/whatsapp';
import { WORKER_PLUGIN, type IWorkerPlugin } from './plugins/worker';
import { STORAGE_PLUGIN, type IStoragePlugin } from './plugins/storage';

import {
  FLOW_REPOSITORY,
  SESSION_REPOSITORY,
  CAMPAIGN_REPOSITORY,
} from './features/repositories.interface';
import { PrismaFlowRepository } from './features/flow/flow.repository';
import { PrismaSessionRepository } from './features/session/session.repository';
import { PrismaCampaignRepository } from './features/campaign/campaign.repository';

import { FlowService } from './features/flow/flow.service';
import { SessionService } from './features/session/session.service';

import { FlowController } from './features/flow/flow.controller';
import { SessionController } from './features/session/session.controller';
import { NodeTypesController } from './features/node-types/node-types.controller';
import { WhatsAppWebhookController } from './features/whatsapp-webhook/whatsapp-webhook.controller';
import { StorageController } from './features/storage/storage.controller';

import { createFlowRouter } from './features/flow/flow.route';
import { createSessionRouter } from './features/session/session.route';
import { createNodeTypesRouter } from './features/node-types/node-types.route';
import { createWhatsAppWebhookRouter } from './features/whatsapp-webhook/whatsapp-webhook.route';
import { createStorageRouter } from './features/storage/storage.route';
import { CampaignService } from './features/campaign/campaign.service';
import { CampaignController } from './features/campaign/campaign.controller';
import { createCampaignRouter } from './features/campaign/campaign.route';

import { errorHandler } from './middleware/error.middleware';

export function createApp(registry: IPluginRegistry): Application {
  const app = express();
  const WEBHOOK_URL = process.env.WEBHOOK_URL;

  app.use(helmet());
  app.use(cors());
  app.use(pinoHttp({ logger: global.logger }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Resolve plugins ──────────────────────────────────────────────────────────
  const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const whatsappPlugin = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  const storagePlugin = registry.get<IStoragePlugin>(STORAGE_PLUGIN);

  // ── Repositories ────────────────────────────────────────────────────────────
  const flowRepo = registry.get<PrismaFlowRepository>(FLOW_REPOSITORY);
  const sessionRepo = registry.get<PrismaSessionRepository>(SESSION_REPOSITORY);
  const campaignRepo = registry.get<PrismaCampaignRepository>(CAMPAIGN_REPOSITORY);

  // ── Services ────────────────────────────────────────────────────────────────
  const flowService = new FlowService(flowRepo);
  const sessionService = new SessionService(sessionRepo, flowRepo, enginePlugin, whatsappPlugin);
  const campaignService = new CampaignService(campaignRepo, workerPlugin);
  
  // Start the background db poller for scheduled campaigns
  campaignService.startScheduler();

  // ── Controllers ─────────────────────────────────────────────────────────────
  const flowController = new FlowController(flowService);
  const sessionController = new SessionController(sessionService);
  const nodeTypesController = new NodeTypesController();
  const webhookController = new WhatsAppWebhookController(whatsappPlugin, workerPlugin);
  const storageController = new StorageController(storagePlugin);
  const campaignController = new CampaignController(campaignService);

  // ── Routes ───────────────────────────────────────────────────────────────────
  app.use('/api/flows', createFlowRouter(flowController));
  app.use('/api/chat-sessions', createSessionRouter(sessionController));
  app.use('/api/node-types', createNodeTypesRouter(nodeTypesController));
  app.use('/api/storage', createStorageRouter(storageController));
  app.use('/api/campaigns', createCampaignRouter(campaignController));

  if (WEBHOOK_URL) {
    app.use(`/api/v1/${WEBHOOK_URL}`, createWhatsAppWebhookRouter(webhookController));
  }
  app.use('/api/webhooks/whatsapp', createWhatsAppWebhookRouter(webhookController));

  app.use(errorHandler);

  return app;
}
