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
import { PrismaContactRepository } from './features/contact/contact.repository';
import { PrismaSessionRepository } from './features/session/session.repository';
import { SessionInboundHandler } from './features/session/session.inbound-handler';

import { DATABASE_PLUGIN, type IDatabasePlugin } from './plugins/database';
import { ENGINE_PLUGIN, type IEnginePlugin } from './plugins/engine';
import { REDIS_PLUGIN, type IRedisPlugin } from './plugins/redis';
import { INBOUND_HANDLER } from './plugins/worker';

async function startServer(): Promise<void> {
  // ── Phase 1: Build registry & register all plugins ───────────────────────
  const registry = new PluginRegistry();

  registry.register(new DatabasePlugin());
  registry.register(new RedisPlugin());
  registry.register(new StoragePlugin());
  registry.register(new EnginePlugin());
  registry.register(new WhatsAppPlugin());
  registry.register(new WorkerPlugin());

  // ── Phase 2: Initialize all plugins (sequential, order above) ────────────
  await registry.initializeAll();

  // ── Phase 3: Register feature handlers (after plugins are ready) ─────────
  const dbPlugin = registry.get<IDatabasePlugin>(DATABASE_PLUGIN);
  const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
  const redisPlugin = registry.get<IRedisPlugin>(REDIS_PLUGIN);

  const flowRepo = new PrismaFlowRepository(dbPlugin.prisma);
  const contactRepo = new PrismaContactRepository(dbPlugin.prisma);
  const sessionRepo = new PrismaSessionRepository(dbPlugin.prisma);

  const inboundHandler = new SessionInboundHandler(
    flowRepo,
    contactRepo,
    sessionRepo,
    enginePlugin,
    redisPlugin,
  );
  registry.registerValue(INBOUND_HANDLER, inboundHandler);

  // ── Phase 4: Mount routes & start listening ───────────────────────────────
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
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
