// ⚠️ dotenv MUST be loaded before any other imports that read process.env
import dotenv from 'dotenv';
dotenv.config();

// Initialises global.logger — must be first side-effect import
import './utils/logger';

import { createApp } from './app';
import { env } from './config/env';
import { PluginRegistry } from './plugins/plugin-registry';
import { DatabasePlugin } from './plugins/database/database.plugin';
import { RedisPlugin } from './plugins/redis/redis.plugin';
import { StoragePlugin } from './plugins/storage/storage.plugin';
import { EnginePlugin } from './plugins/engine/engine.plugin';
import { WhatsAppPlugin } from './plugins/whatsapp/whatsapp.plugin';
import { AuthPlugin } from './plugins/auth/auth.plugin';
import { WorkerPlugin } from './plugins/worker/worker.plugin';
import { RenudgeService } from './features/renudge/renudge.service';

import { PrismaFlowRepository } from './features/flow/flow.repository';
import { PrismaSessionRepository } from './features/session/session.repository';
import { SessionInboundHandler } from './features/session/session.inbound-handler';

import { DATABASE_PLUGIN, type IDatabasePlugin } from './plugins/database';
import { ENGINE_PLUGIN, type IEnginePlugin } from './plugins/engine';
import { REDIS_PLUGIN, type IRedisPlugin } from './plugins/redis';
import { STORAGE_PLUGIN, type IStoragePlugin } from './plugins/storage';
import { WHATSAPP_PLUGIN, type IWhatsAppPlugin } from './plugins/whatsapp';
import { WORKER_PLUGIN, type IWorkerPlugin } from './plugins/worker';
import {
  FLOW_REPOSITORY,
  SESSION_REPOSITORY,
  CAMPAIGN_REPOSITORY,
  CAMPAIGN_RECIPIENT_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  CREDENTIAL_SERVICE,
  INBOUND_HANDLER,
  VOICE_ENTITY_REPOSITORY,
  VOICE_ROUTING_REPOSITORY,
  RENUDGE_SERVICE,
  ACTIVITY_LOG_REPOSITORY,
  ACTIVITY_LOG_SERVICE,
  WA_FLOW_SURVEY_REPOSITORY,
  WA_FLOW_SURVEY_SERVICE,
} from './features/repositories.interface';
import { PrismaActivityLogRepository } from './features/activity-log/infrastructure/prisma-activity-log.repository';
import { ActivityLogService } from './features/activity-log/application/activity-log.service';
import {
  PrismaWaFlowSurveyRepository,
  WaFlowSurveyService,
} from './features/wa-flow-survey';
import {
  loadMsAssistantConfig,
  resolveMsAssistantApiKey,
  MsAssistantService,
  MS_ASSISTANT_SERVICE,
} from './features/ms-assistant';
import { RedisConversationMemory } from './features/ms-assistant/infrastructure/memory/redis-memory';
import { QdrantKnowledgeStore } from './features/ms-assistant/infrastructure/rag/qdrant.store';
import { createMsEmbeddings, createMsLlm } from './features/ms-assistant/providers';
import { PrismaCampaignRepository } from './features/campaign/campaign.repository';
import { PrismaCampaignRecipientRepository } from './features/campaign/campaign-recipient.repository';
import { OpenAIPlugin } from './plugins/openai/openai.plugin';
import { ElevenLabsPlugin } from './plugins/elevenlabs/elevenlabs.plugin';
import { AnthropicPlugin } from './plugins/anthropic/anthropic.plugin';
import { DeepSeekPlugin } from './plugins/deepseek/deepseek.plugin';
import { HttpRequestPlugin } from './plugins/http-request/http-request.plugin';
import { GoogleSheetsPlugin } from './plugins/google-sheets/google-sheets.plugin';
import { NocoDBPlugin } from './plugins/nocodb/nocodb.plugin';
import { VoiceProvidersPlugin } from './plugins/voice-providers';
import { CredentialService, PrismaCredentialRepository } from './features/credentials';
import { PrismaEntityRepository } from './features/voice-tech/data/entity.repository';
import { PrismaVoiceRoutingRepository } from './features/voice-tech/data/routing.repository';


async function startServer(): Promise<void> {
  // ── Phase 1: Build registry & register all plugins ───────────────────────
  const registry = new PluginRegistry();

  const enableServer = process.env.ENABLE_SERVER !== 'false';

  registry.register(new DatabasePlugin());
  registry.register(new RedisPlugin());
  registry.register(new StoragePlugin());
  registry.register(new EnginePlugin());
  registry.register(new WhatsAppPlugin());
  registry.register(new AuthPlugin());
  registry.register(new VoiceProvidersPlugin());

  registry.register(new WorkerPlugin());

  registry.register(new OpenAIPlugin());
  registry.register(new ElevenLabsPlugin());
  registry.register(new AnthropicPlugin());
  registry.register(new DeepSeekPlugin());
  registry.register(new HttpRequestPlugin());
  registry.register(new GoogleSheetsPlugin());
  registry.register(new NocoDBPlugin());

  // ── Phase 2: Initialize all plugins (sequential, order above) ────────────
  await registry.initializeAll();

  // ── Phase 3: Register feature handlers (after plugins are ready) ─────────
  const dbPlugin = registry.get<IDatabasePlugin>(DATABASE_PLUGIN);
  const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const redisPlugin = registry.get<IRedisPlugin>(REDIS_PLUGIN);
  const storagePlugin = registry.get<IStoragePlugin>(STORAGE_PLUGIN);
  const whatsappPlugin = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
  const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  
  const flowRepo = new PrismaFlowRepository(dbPlugin.prisma);
  const sessionRepo = new PrismaSessionRepository(dbPlugin.prisma);
  const campaignRepo = new PrismaCampaignRepository(dbPlugin.prisma);
  const recipientRepo = new PrismaCampaignRecipientRepository(dbPlugin.prisma);
  const activityLogRepo = new PrismaActivityLogRepository(dbPlugin.prisma);
  const activityLogService = new ActivityLogService(activityLogRepo);
  const waFlowSurveyRepo = new PrismaWaFlowSurveyRepository(dbPlugin.prisma);
  const waFlowSurveyService = new WaFlowSurveyService(waFlowSurveyRepo);
  const credentialRepo = new PrismaCredentialRepository(dbPlugin.prisma);
  const credentialService = new CredentialService(credentialRepo, undefined, activityLogService);
  const voiceEntityRepo = new PrismaEntityRepository(dbPlugin.prisma, redisPlugin.client);
  const voiceRoutingRepo = new PrismaVoiceRoutingRepository(dbPlugin.prisma, redisPlugin.client);
  const renudgeService = new RenudgeService(workerPlugin, dbPlugin);

  registry.registerValue(FLOW_REPOSITORY, flowRepo);
  registry.registerValue(SESSION_REPOSITORY, sessionRepo);
  registry.registerValue(CAMPAIGN_REPOSITORY, campaignRepo);
  registry.registerValue(CAMPAIGN_RECIPIENT_REPOSITORY, recipientRepo);
  registry.registerValue(CREDENTIAL_REPOSITORY, credentialRepo);
  registry.registerValue(CREDENTIAL_SERVICE, credentialService);
  registry.registerValue(VOICE_ENTITY_REPOSITORY, voiceEntityRepo);
  registry.registerValue(VOICE_ROUTING_REPOSITORY, voiceRoutingRepo);
  registry.registerValue(RENUDGE_SERVICE, renudgeService);
  registry.registerValue(ACTIVITY_LOG_REPOSITORY, activityLogRepo);
  registry.registerValue(ACTIVITY_LOG_SERVICE, activityLogService);
  registry.registerValue(WA_FLOW_SURVEY_REPOSITORY, waFlowSurveyRepo);
  registry.registerValue(WA_FLOW_SURVEY_SERVICE, waFlowSurveyService);

  const msAssistantConfig = loadMsAssistantConfig();
  let msAssistant: MsAssistantService | undefined;
  if (msAssistantConfig.enabled) {
    if (!resolveMsAssistantApiKey(msAssistantConfig)) {
      logger.warn(
        'Managed Services Assistant enabled but GitHub PAT missing (OPENAI_API_KEY or GITHUB_TOKEN) — assistant disabled',
      );
    } else {
      try {
        msAssistant = new MsAssistantService(
          msAssistantConfig,
          new RedisConversationMemory(redisPlugin.client, msAssistantConfig),
          createMsEmbeddings(msAssistantConfig),
          new QdrantKnowledgeStore(msAssistantConfig),
          createMsLlm(msAssistantConfig),
        );
        registry.registerValue(MS_ASSISTANT_SERVICE, msAssistant);
        logger.info(
          {
            collection: msAssistantConfig.QDRANT_COLLECTION,
            qdrant: msAssistantConfig.QDRANT_URL,
            llm: msAssistantConfig.MS_ASSISTANT_LLM_PROVIDER,
            embeddings: msAssistantConfig.MS_ASSISTANT_EMBED_PROVIDER,
            model: msAssistantConfig.MS_ASSISTANT_CHAT_MODEL,
          },
          'Managed Services Assistant ready (fallback when no intent match)',
        );
      } catch (err) {
        logger.error({ err }, 'Managed Services Assistant failed to initialize');
      }
    }
  }

  const inboundHandler = new SessionInboundHandler(
    flowRepo,
    sessionRepo,
    enginePlugin,
    redisPlugin,
    storagePlugin,
    whatsappPlugin,
    credentialRepo,
    renudgeService,
    msAssistant,
  );
  registry.registerValue(INBOUND_HANDLER, inboundHandler);

  // ── Phase 4: Mount routes & start listening ───────────────────────────────
  if (enableServer) {
    const app = createApp(registry);
    const PORT = parseInt(env.PORT, 10);

    const server = app.listen(PORT, () => {
      logger.info(`✓ Server running on port ${PORT}`);
      logger.info(`✓ Environment: ${env.NODE_ENV}`);
      logger.info(`✓ Health check: http://localhost:${PORT}/health`);
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    async function shutdown(): Promise<void> {
      logger.info('Shutting down gracefully...');
      server.close(async () => {
        await registry.shutdownAll();
        logger.info('✓ All plugins shut down');
        process.exit(0);
      });
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } else {
    logger.info('✓ Worker node started (Server disabled)');

    // Graceful shutdown for workers only
    async function shutdownWorker(): Promise<void> {
      logger.info('Shutting down worker gracefully...');
      await registry.shutdownAll();
      logger.info('✓ All plugins shut down');
      process.exit(0);
    }

    process.on('SIGTERM', shutdownWorker);
    process.on('SIGINT', shutdownWorker);
  }
}

startServer().catch(err => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});