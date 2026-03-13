// ⚠️ dotenv MUST be loaded before any other imports that read process.env
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { env } from './config/env';
import { PluginRegistry } from './plugins/plugin-registry';
import { DatabasePlugin } from './plugins/database/database.plugin';
import { RedisPlugin } from './plugins/redis/redis.plugin';
import { StoragePlugin } from './plugins/storage/storage.plugin';
import { EnginePlugin } from './plugins/engine/engine.plugin';
import { WhatsAppPlugin } from './plugins/whatsapp/whatsapp.plugin';
import { WorkerPlugin } from './plugins/worker/worker.plugin';

import { PrismaFlowRepository } from './features/flow/flow.repository';
import { PrismaSessionRepository } from './features/session/session.repository';
import { SessionInboundHandler } from './features/session/session.inbound-handler';

import { DATABASE_PLUGIN, type IDatabasePlugin } from './plugins/database';
import { ENGINE_PLUGIN, type IEnginePlugin } from './plugins/engine';
import { REDIS_PLUGIN, type IRedisPlugin } from './plugins/redis';
import {
  FLOW_REPOSITORY,
  SESSION_REPOSITORY,
  CAMPAIGN_REPOSITORY,
  CAMPAIGN_RECIPIENT_REPOSITORY,
  INBOUND_HANDLER
} from './features/repositories.interface';
import { PrismaCampaignRepository } from './features/campaign/campaign.repository';
import { PrismaCampaignRecipientRepository } from './features/campaign/campaign-recipient.repository';

async function startServer(): Promise<void> {
  // ── Phase 1: Build registry & register all plugins ───────────────────────
  const registry = new PluginRegistry();

  const enableServer = process.env.ENABLE_SERVER !== 'false';
  const enableWorker = process.env.ENABLE_WORKER !== 'false';

  registry.register(new DatabasePlugin());
  registry.register(new RedisPlugin());
  registry.register(new StoragePlugin());
  registry.register(new EnginePlugin());
  registry.register(new WhatsAppPlugin());

  if (enableWorker) {
    registry.register(new WorkerPlugin());
  }

  // ── Phase 2: Initialize all plugins (sequential, order above) ────────────
  await registry.initializeAll();

  // ── Phase 3: Register feature handlers (after plugins are ready) ─────────
  const dbPlugin = registry.get<IDatabasePlugin>(DATABASE_PLUGIN);
  const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const redisPlugin = registry.get<IRedisPlugin>(REDIS_PLUGIN);

  const flowRepo = new PrismaFlowRepository(dbPlugin.prisma);
  const sessionRepo = new PrismaSessionRepository(dbPlugin.prisma);
  const campaignRepo = new PrismaCampaignRepository(dbPlugin.prisma);
  const recipientRepo = new PrismaCampaignRecipientRepository(dbPlugin.prisma);

  registry.registerValue(FLOW_REPOSITORY, flowRepo);
  registry.registerValue(SESSION_REPOSITORY, sessionRepo);
  registry.registerValue(CAMPAIGN_REPOSITORY, campaignRepo);
  registry.registerValue(CAMPAIGN_RECIPIENT_REPOSITORY, recipientRepo);

  const inboundHandler = new SessionInboundHandler(
    flowRepo,
    sessionRepo,
    enginePlugin,
    redisPlugin,
  );
  registry.registerValue(INBOUND_HANDLER, inboundHandler);

  // ── Phase 4: Mount routes & start listening ───────────────────────────────
  if (enableServer) {
    const app = createApp(registry);
    const PORT = parseInt(env.PORT, 10);

    const server = app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${env.NODE_ENV}`);
      console.log(`✓ Health check: http://localhost:${PORT}/health`);
    });

    // ── Graceful shutdown ─────────────────────────────────────────────────────
    async function shutdown(): Promise<void> {
      console.log('\nShutting down gracefully...');
      server.close(async () => {
        await registry.shutdownAll();
        console.log('✓ All plugins shut down');
        process.exit(0);
      });
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } else {
    console.log('✓ Worker node started (Server disabled)');

    // Graceful shutdown for workers only
    async function shutdownWorker(): Promise<void> {
      console.log('\nShutting down worker gracefully...');
      await registry.shutdownAll();
      console.log('✓ All plugins shut down');
      process.exit(0);
    }

    process.on('SIGTERM', shutdownWorker);
    process.on('SIGINT', shutdownWorker);
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
