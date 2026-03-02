import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { InboundJobData } from '../types';
import { INBOUND_QUEUE_NAME } from '../../lib/queue';
import { getRedisClient, getBullConnection } from '../../lib/redis';
import { Container } from '../../container';
import { ValidationError } from '../../utils/errors';

const LOCK_PREFIX = 'wa:lock:';
const LOCK_TTL_SECONDS = 10;

export function createInboundWorker(): Worker<InboundJobData> {
  const connection = getBullConnection();
  const redis = getRedisClient();
  
  const worker = new Worker<InboundJobData>(
    INBOUND_QUEUE_NAME,
    async (job: Job<InboundJobData>) => {
      const { orgId, message } = job.data;
      const { waId, waBusinessNumber, text } = message;
      
      console.log(`[InboundWorker] Processing message ${message.messageId} for ${waId}`);
      
      // Acquire distributed lock on waId to prevent race conditions
      const lockKey = `${LOCK_PREFIX}${waBusinessNumber}:${waId}`;
      const lockValue = job.id || `job-${Date.now()}`;
      
      const lockAcquired = await acquireLock(redis, lockKey, lockValue, LOCK_TTL_SECONDS);
      if (!lockAcquired) {
        console.log(`[InboundWorker] Could not acquire lock for ${waId}, rescheduling`);
        throw new Error('Lock not acquired'); // Will trigger retry with backoff
      }
      
      try {
        const container = Container.getInstance();
        const { flowRepository, contactService, sessionRepository, flowOrchestrator } = container;
        
        // Ensure contact exists
        const contact = await contactService.getOrCreateContactByWaId(orgId, waId, message.contactName);
        
        // Check for active session
        const activeSession = await sessionRepository.findCurrentByWhatsApp(waBusinessNumber, waId);
        
        let result;
        
        if (activeSession) {
          // Resume existing flow
          console.log(`[InboundWorker] Resuming session ${activeSession._id} for ${waId}`);
          
          // Check if session is waiting for choice input
          const waitingFor = activeSession.waitingFor;
          let userInput = text;
          if (waitingFor?.type === 'choice' && message.interactiveOptionId) {
            userInput = message.interactiveOptionId;
            console.log(`[InboundWorker] Using interactive option ID: ${userInput}`);
          }
          
          result = await flowOrchestrator.resumeFlow({
            sessionId: String(activeSession._id),
            userInput,
          });
        } else {
          // Find matching flow by keyword
          const normalized = text.toLowerCase();
          const tokens = normalized.split(/\s+/).filter(Boolean);
          
          let flow = null;
          for (const token of tokens) {
            flow = await flowRepository.findPublishedByOrgAndKeyword(orgId, token);
            if (flow) break;
          }
          
          if (!flow) {
            throw new ValidationError('No published flow matched the incoming message');
          }
          
          console.log(`[InboundWorker] Starting flow ${flow._id} for ${waId}`);
          
          // Clear any existing current flags
          await sessionRepository.clearCurrentFlags(waBusinessNumber, waId);
          
          result = await flowOrchestrator.startFlow({
            orgId,
            flowId: String(flow._id),
            contactId: String(contact._id),
            waId,
            waBusinessNumber,
            initialVariables: {},
          });
        }
        
        // Queue outbound messages
        if (result.outboundMessages.length > 0) {
          const { enqueueOutboundMessages } = await import('../../lib/queue');
          await enqueueOutboundMessages(
            waId,
            waBusinessNumber,
            result.outboundMessages.map((m) => ({ type: m.type, payload: m.payload })),
            orgId,
            String(result.session._id)
          );
        }
        
        console.log(`[InboundWorker] Completed message ${message.messageId}`);
        
      } finally {
        // Release lock
        await releaseLock(redis, lockKey, lockValue);
      }
    },
    {
      connection,
      concurrency: 10,
    }
  );
  
  worker.on('completed', (job) => {
    console.log(`[InboundWorker] Job ${job.id} completed`);
  });
  
  worker.on('failed', (job, error) => {
    console.error(`[InboundWorker] Job ${job?.id} failed:`, error);
  });
  
  return worker;
}

async function acquireLock(
  redis: Redis,
  key: string,
  value: string,
  ttlSeconds: number
): Promise<boolean> {
  const result = await redis.set(key, value, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

async function releaseLock(redis: Redis, key: string, value: string): Promise<void> {
  // Only release if we still own the lock
  const currentValue = await redis.get(key);
  if (currentValue === value) {
    await redis.del(key);
  }
}
