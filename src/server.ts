import dotenv from 'dotenv';
import { createApp } from './app';
import { validateEnv } from './config/env';
import { connectDatabase } from './config/database';
import { createInboundWorker } from './whatsapp/workers/inbound.worker';
import { createOutboundWorker } from './whatsapp/workers/outbound.worker';
import type { Worker } from 'bullmq';
import type { WhatsAppConfig } from './whatsapp/whatsapp-api.service';

dotenv.config();

let inboundWorker: Worker | null = null;
let outboundWorker: Worker | null = null;

async function startServer() {
  const env = validateEnv();

  await connectDatabase(env.MONGODB_URI);

  // Start workers if Redis is configured
  if (env.REDIS_URL) {
    console.log('✓ Starting WhatsApp workers...');
    inboundWorker = createInboundWorker();
    
    // Configure outbound worker if WhatsApp API is configured
    if (env.WHATSAPP_API_URL && env.WHATSAPP_API_TOKEN) {
      const waConfig: WhatsAppConfig = {
        apiUrl: env.WHATSAPP_API_URL,
        apiToken: env.WHATSAPP_API_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      };
      outboundWorker = createOutboundWorker(waConfig);
      console.log('✓ Outbound worker started');
    } else {
      console.log('⚠ WhatsApp API not configured - outbound messages will be logged only');
    }
  } else {
    console.log('⚠ Redis not configured - WhatsApp workers disabled');
  }

  const app = createApp();
  const PORT = parseInt(env.PORT, 10);

  app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
    console.log(`✓ Environment: ${env.NODE_ENV}`);
    console.log(`✓ Health check: http://localhost:${PORT}/health`);
    console.log(`✓ API endpoints:`);
    console.log(`  - POST   /api/flows`);
    console.log(`  - GET    /api/flows`);
    console.log(`  - GET    /api/flows/:id`);
    console.log(`  - PUT    /api/flows/:id`);
    console.log(`  - POST   /api/flows/:id/publish`);
    console.log(`  - POST   /api/flows/:id/archive`);
    console.log(`  - DELETE /api/flows/:id`);
    console.log(`  - GET    /api/node-types`);
    console.log(`  - GET    /api/contacts`);
    console.log(`  - POST   /api/chat-sessions`);
    console.log(`  - POST   /api/chat-sessions/:id/resume`);
    console.log(`  - GET    /api/webhooks/whatsapp/:orgId`);
    console.log(`  - POST   /api/webhooks/whatsapp/:orgId`);
  });
}

async function shutdown() {
  console.log('\nShutting down gracefully...');
  
  if (inboundWorker) {
    await inboundWorker.close();
    console.log('✓ Inbound worker stopped');
  }
  
  if (outboundWorker) {
    await outboundWorker.close();
    console.log('✓ Outbound worker stopped');
  }
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
