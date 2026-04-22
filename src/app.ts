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
import { VOICE_PROVIDERS_PLUGIN, type IVoiceProvidersPlugin } from './plugins/voice-providers';
import { STORAGE_PLUGIN, type IStoragePlugin } from './plugins/storage';
import { REDIS_PLUGIN, type IRedisPlugin } from './plugins/redis';
import { OPENAI_PLUGIN, type IOpenAIPlugin } from './plugins/openai';
import { ELEVENLABS_PLUGIN, type IElevenLabsPlugin } from './plugins/elevenlabs';
import { ANTHROPIC_PLUGIN, type IAnthropicPlugin } from './plugins/anthropic';
import { DEEPSEEK_PLUGIN, type IDeepSeekPlugin } from './plugins/deepseek';
import { HTTP_REQUEST_PLUGIN, type IHttpRequestPlugin } from './plugins/http-request';

import {
  FLOW_REPOSITORY,
  SESSION_REPOSITORY,
  CAMPAIGN_REPOSITORY,
  CAMPAIGN_RECIPIENT_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  CREDENTIAL_SERVICE,
  VOICE_ENTITY_REPOSITORY,
  VOICE_ROUTING_REPOSITORY,
} from './features/repositories.interface';

import { PrismaFlowRepository } from './features/flow/flow.repository';
import { PrismaSessionRepository } from './features/session/session.repository';
import { PrismaCampaignRepository } from './features/campaign/campaign.repository';
import { PrismaEntityRepository } from './features/voice-tech/data/entity.repository';
import { PrismaVoiceRoutingRepository } from './features/voice-tech/data/routing.repository';
import type { CredentialService } from './features/credentials';
import type { ICredentialRepository } from './features/credentials/credentials.repository.interface';
import type { ICampaignRecipientRepository } from './features/campaign/campaign-recipient.repository';

import { FlowService } from './features/flow/flow.service';
import { SessionService } from './features/session/session.service';
import { CampaignService } from './features/campaign/campaign.service';
import { EntityQueryService } from './features/voice-tech/services/entity-query.service';
import { IngestionService } from './features/voice-tech/services/ingestion.service';
import { VoiceRoutingService } from './features/voice-tech/services/voice-routing.service';
import { VoiceCampaignService } from './features/voice-tech/services/voice-campaign.service';
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
import { VoiceEntityController } from './features/voice-tech/entity.controller';
import { VoiceRoutingController } from './features/voice-tech/routing.controller';
import { ExotelCallbackController } from './features/voice-tech/exotel-callback.controller';

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
import { createVoiceEntityRouter } from './features/voice-tech/entity.route';
import { createVoiceRoutingRouter } from './features/voice-tech/routing.route';
import { createExotelCallbackRouter } from './features/voice-tech/exotel-callback.route';

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
  const voiceProvidersPlugin = registry.get<IVoiceProvidersPlugin>(VOICE_PROVIDERS_PLUGIN);
  const storagePlugin = registry.get<IStoragePlugin>(STORAGE_PLUGIN);
  const redisPlugin = registry.get<IRedisPlugin>(REDIS_PLUGIN);
  const openAIPlugin = registry.get<IOpenAIPlugin>(OPENAI_PLUGIN);
  const elevenLabsPlugin = registry.get<IElevenLabsPlugin>(ELEVENLABS_PLUGIN);
  const anthropicPlugin = registry.get<IAnthropicPlugin>(ANTHROPIC_PLUGIN);
  const deepSeekPlugin = registry.get<IDeepSeekPlugin>(DEEPSEEK_PLUGIN);
  const httpRequestPlugin = registry.get<IHttpRequestPlugin>(HTTP_REQUEST_PLUGIN);

  // ── Repositories ───────────────────────────────────────────────────────────
  const flowRepo = registry.get<PrismaFlowRepository>(FLOW_REPOSITORY);
  const sessionRepo = registry.get<PrismaSessionRepository>(SESSION_REPOSITORY);
  const campaignRepo = registry.get<PrismaCampaignRepository>(CAMPAIGN_REPOSITORY);
  const voiceEntityRepo = registry.get<PrismaEntityRepository>(VOICE_ENTITY_REPOSITORY);
  const voiceRoutingRepo = registry.get<PrismaVoiceRoutingRepository>(VOICE_ROUTING_REPOSITORY);
  const campaignRecipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
  const credentialRepo = registry.get<ICredentialRepository>(CREDENTIAL_REPOSITORY);
  const credentialService = registry.get<CredentialService>(CREDENTIAL_SERVICE);

  // ── Services ───────────────────────────────────────────────────────────────
  const flowService = new FlowService(flowRepo);
  const sessionService = new SessionService(sessionRepo, flowRepo, enginePlugin, whatsappPlugin, workerPlugin);
  const campaignService = new CampaignService(campaignRepo, workerPlugin);
  const ingestionService = new IngestionService(voiceEntityRepo, storagePlugin);
  const entityQueryService = new EntityQueryService(voiceEntityRepo);
  const voiceRoutingService = new VoiceRoutingService(voiceRoutingRepo, voiceProvidersPlugin, credentialService);
  const voiceCampaignService = new VoiceCampaignService(entityQueryService, voiceRoutingService);
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
  const voiceEntityController = new VoiceEntityController(
    ingestionService,
    voiceEntityRepo,
    voiceRoutingRepo,
    workerPlugin,
    redisPlugin,
  );
  const voiceRoutingController = new VoiceRoutingController(
    voiceRoutingService,
    entityQueryService,
    voiceCampaignService,
    voiceRoutingRepo
  );
  const exotelCallbackController = new ExotelCallbackController(campaignRecipientRepo);

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
  app.use('/api/voice-tech/entities', createVoiceEntityRouter(voiceEntityController));
  app.use('/api/voice-tech/routing', createVoiceRoutingRouter(voiceRoutingController));
  app.use('/api/voice-tech/providers/exotel', createExotelCallbackRouter(exotelCallbackController));

  if (WEBHOOK_URL) {
    app.use(`/api/v1/${WEBHOOK_URL}`, createWhatsAppWebhookRouter(webhookController));
  }
  app.use('/api/webhooks/whatsapp', createWhatsAppWebhookRouter(webhookController));

  app.use(errorHandler);
  return app;
}
