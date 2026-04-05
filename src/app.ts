import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { toNodeHandler } from 'better-auth/node';

import type { IPluginRegistry } from './plugins/plugin.interface';
import { AUTH_PLUGIN, type IAuthPlugin } from './plugins/auth';
import { ENGINE_PLUGIN, type IEnginePlugin } from './plugins/engine';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from './plugins/whatsapp';
import { WORKER_PLUGIN, type IWorkerPlugin } from './plugins/worker';
import { STORAGE_PLUGIN, type IStoragePlugin } from './plugins/storage';
import { OPENAI_PLUGIN, type IOpenAIPlugin } from './plugins/openai';
import { ELEVENLABS_PLUGIN, type IElevenLabsPlugin } from './plugins/elevenlabs';
import { ANTHROPIC_PLUGIN, type IAnthropicPlugin } from './plugins/anthropic';
import { DEEPSEEK_PLUGIN, type IDeepSeekPlugin } from './plugins/deepseek';
import { HTTP_REQUEST_PLUGIN, type IHttpRequestPlugin } from './plugins/http-request';

import {
  FLOW_REPOSITORY,
  SESSION_REPOSITORY,
  CAMPAIGN_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  CREDENTIAL_SERVICE,
} from './features/repositories.interface';

import { PrismaFlowRepository } from './features/flow/flow.repository';
import { PrismaSessionRepository } from './features/session/session.repository';
import { PrismaCampaignRepository } from './features/campaign/campaign.repository';
import type { CredentialService } from './features/credentials';
import type { ICredentialRepository } from './features/credentials/credentials.repository.interface';

import { FlowService } from './features/flow/flow.service';
import { SessionService } from './features/session/session.service';
import { CampaignService } from './features/campaign/campaign.service';
import { OpenAIIntegrationService } from './plugins/openai';
import { ElevenLabsIntegrationService } from './plugins/elevenlabs';
import { AnthropicIntegrationService } from './plugins/anthropic/anthropic.service';
import { DeepSeekIntegrationService } from './plugins/deepseek/deepseek.service';
import { HttpRequestIntegrationService } from './plugins/http-request';

import { FlowController } from './features/flow/flow.controller';
import { SessionController } from './features/session/session.controller';
import { NodeTypesController } from './features/node-types/node-types.controller';
import { WhatsAppWebhookController } from './features/whatsapp-webhook/whatsapp-webhook.controller';
import { StorageController } from './features/storage/storage.controller';
import { CampaignController } from './features/campaign/campaign.controller';
import { OpenAIController } from './features/integrations/openai/openai.controller';
import { ElevenLabsController } from './features/integrations/elevenlabs/elevenlabs.controller';
import { AnthropicController } from './features/integrations/anthropic/anthropic.controller';
import { DeepSeekController } from './features/integrations/deepseek/deepseek.controller';
import { GoogleSheetsController } from './features/integrations/google-sheets/google-sheets.controller';
import { NocoDBController } from './features/integrations/nocodb/nocodb.controller';
import { HttpRequestController } from './features/integrations/http-request/http-request.controller';
import { CredentialController } from './features/credentials';

import { createFlowRouter } from './features/flow/flow.route';
import { createSessionRouter } from './features/session/session.route';
import { createNodeTypesRouter } from './features/node-types/node-types.route';
import { createWhatsAppWebhookRouter } from './features/whatsapp-webhook/whatsapp-webhook.route';
import { createStorageRouter } from './features/storage/storage.route';
import { createCampaignRouter } from './features/campaign/campaign.route';
import { WhatsAppController } from './features/whatsapp/whatsapp.controller';
import { createWhatsAppRouter } from './features/whatsapp/whatsapp.route';
import { createOpenAIRouter } from './features/integrations/openai/openai.route';
import { createElevenLabsRouter } from './features/integrations/elevenlabs/elevenlabs.route';
import { createAnthropicRouter } from './features/integrations/anthropic/anthropic.route';
import { createDeepSeekRouter } from './features/integrations/deepseek/deepseek.route';
import { createGoogleSheetsRouter } from './features/integrations/google-sheets/google-sheets.route';
import { createNocoDBRouter } from './features/integrations/nocodb/nocodb.route';
import { createHttpRequestRouter } from './features/integrations/http-request/http-request.route';
import { createCredentialRouter } from './features/credentials';
import { createWhatsAppIntegrationRouter } from './features/integrations/whatsapp/whatsapp-integration.route';

import { errorHandler } from './middleware/error.middleware';
import { GoogleSheetsIntegrationService } from './plugins/google-sheets/google-sheets.service';

export function createApp(registry: IPluginRegistry): Application {
  const app = express();
  const WEBHOOK_URL = process.env.WEBHOOK_URL;
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const authPlugin = registry.get<IAuthPlugin>(AUTH_PLUGIN);
  const authHandler = toNodeHandler(authPlugin.auth as any);

  app.use(helmet());
  app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
  }));
  app.all('/api/auth/{*any}', authHandler);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({
    logger: global.logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          query: req.query,
          params: req.params,
          payload: (req as any).body,
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Resolve plugins ────────────────────────────────────────────────────────
  const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const whatsappPlugin = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  const storagePlugin = registry.get<IStoragePlugin>(STORAGE_PLUGIN);
  const openAIPlugin = registry.get<IOpenAIPlugin>(OPENAI_PLUGIN);
  const elevenLabsPlugin = registry.get<IElevenLabsPlugin>(ELEVENLABS_PLUGIN);
  const anthropicPlugin = registry.get<IAnthropicPlugin>(ANTHROPIC_PLUGIN);
  const deepSeekPlugin = registry.get<IDeepSeekPlugin>(DEEPSEEK_PLUGIN);
  const httpRequestPlugin = registry.get<IHttpRequestPlugin>(HTTP_REQUEST_PLUGIN);

  // ── Repositories ───────────────────────────────────────────────────────────
  const flowRepo = registry.get<PrismaFlowRepository>(FLOW_REPOSITORY);
  const sessionRepo = registry.get<PrismaSessionRepository>(SESSION_REPOSITORY);
  const campaignRepo = registry.get<PrismaCampaignRepository>(CAMPAIGN_REPOSITORY);
  const credentialRepo = registry.get<ICredentialRepository>(CREDENTIAL_REPOSITORY);
  const credentialService = registry.get<CredentialService>(CREDENTIAL_SERVICE);

  // ── Services ───────────────────────────────────────────────────────────────
  const flowService = new FlowService(flowRepo);
  const sessionService = new SessionService(sessionRepo, flowRepo, enginePlugin, whatsappPlugin, workerPlugin);
  const campaignService = new CampaignService(campaignRepo, workerPlugin);
  const openAIService = new OpenAIIntegrationService(credentialService, openAIPlugin, storagePlugin);
  const elevenLabsService = new ElevenLabsIntegrationService(credentialService, elevenLabsPlugin, storagePlugin);
  const anthropicService = new AnthropicIntegrationService(credentialService, anthropicPlugin);
  const deepSeekService = new DeepSeekIntegrationService(deepSeekPlugin, credentialService);
  const googleSheetsService = new GoogleSheetsIntegrationService(credentialService, registry);
  const httpRequestService = new HttpRequestIntegrationService(credentialService, httpRequestPlugin);

  // Start background scheduler
  campaignService.startScheduler();

  // ── Controllers ────────────────────────────────────────────────────────────
  const flowController = new FlowController(flowService);
  const sessionController = new SessionController(sessionService);
  const nodeTypesController = new NodeTypesController();
  const webhookController = new WhatsAppWebhookController(whatsappPlugin, workerPlugin, credentialRepo);
  const storageController = new StorageController(storagePlugin);
  const campaignController = new CampaignController(campaignService);
  const whatsappController = new WhatsAppController(whatsappPlugin);
  const openAIController = new OpenAIController(openAIService);
  const elevenLabsController = new ElevenLabsController(elevenLabsService);
  const anthropicController = new AnthropicController(anthropicService);
  const deepSeekController = new DeepSeekController(deepSeekService);
  const googleSheetsController = new GoogleSheetsController(googleSheetsService);
  const nocodbController = new NocoDBController(registry, credentialService);
  const httpRequestController = new HttpRequestController(httpRequestService);
  const credentialController = new CredentialController(credentialService);

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api/flows', createFlowRouter(flowController));
  app.use('/api/chat-sessions', createSessionRouter(sessionController));
  app.use('/api/node-types', createNodeTypesRouter(nodeTypesController));
  app.use('/api/storage', createStorageRouter(storageController));
  app.use('/api/campaigns', createCampaignRouter(campaignController));
  app.use('/api/whatsapp', createWhatsAppRouter(whatsappController));
  app.use('/api/integrations/credentials', createCredentialRouter(credentialController));
  app.use('/api/integrations/openai', createOpenAIRouter(openAIController));
  app.use('/api/integrations/elevenlabs', createElevenLabsRouter(elevenLabsController));
  app.use('/api/integrations/anthropic', createAnthropicRouter(anthropicController));
  app.use('/api/integrations/deepseek', createDeepSeekRouter(deepSeekController));
  app.use('/api/integrations/google-sheets', createGoogleSheetsRouter(googleSheetsController));
  app.use('/api/integrations/nocodb', createNocoDBRouter(nocodbController));
  app.use('/api/integrations/http-request', createHttpRequestRouter(httpRequestController));
  app.use('/api/integrations/whatsapp', createWhatsAppIntegrationRouter());

  if (WEBHOOK_URL) {
    app.use(`/api/v1/${WEBHOOK_URL}`, createWhatsAppWebhookRouter(webhookController));
  }
  app.use('/api/webhooks/whatsapp', createWhatsAppWebhookRouter(webhookController));

  app.use(errorHandler);
  return app;
}
