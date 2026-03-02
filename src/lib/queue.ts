import { Queue, Job } from 'bullmq';
import { InboundJobData, NormalizedInboundMessage } from '../whatsapp/types';
import { getBullConnection } from '../lib/redis';

export const INBOUND_QUEUE_NAME = 'wa-inbound';
export const OUTBOUND_QUEUE_NAME = 'wa-outbound';

export interface OutboundJobData {
  waId: string;
  waBusinessNumber: string;
  messageType: string;
  payload: Record<string, any>;
  orgId: string;
  sessionId?: string | undefined;
}

let inboundQueue: Queue<InboundJobData> | null = null;
let outboundQueue: Queue<OutboundJobData> | null = null;

export function getInboundQueue(): Queue<InboundJobData> {
  if (inboundQueue) return inboundQueue;
  
  const connection = getBullConnection();
  inboundQueue = new Queue<InboundJobData>(INBOUND_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
  
  return inboundQueue;
}

export function getOutboundQueue(): Queue<OutboundJobData> {
  if (outboundQueue) return outboundQueue;
  
  const connection = getBullConnection();
  outboundQueue = new Queue<OutboundJobData>(OUTBOUND_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 200,
      removeOnFail: 100,
    },
  });
  
  return outboundQueue;
}

export async function enqueueInboundMessage(
  message: NormalizedInboundMessage
): Promise<Job<InboundJobData>> {
  const queue = getInboundQueue();
  return queue.add(
    `inbound:${message.messageId}`,
    {
      orgId: message.orgId,
      message,
    },
    {
      jobId: message.messageId, // Idempotency: same messageId = same job
    }
  );
}

export async function enqueueOutboundMessages(
  waId: string,
  waBusinessNumber: string,
  messages: Array<{ type: string; payload: Record<string, any> }>,
  orgId: string,
  sessionId?: string
): Promise<Job<OutboundJobData>[]> {
  const queue = getOutboundQueue();
  const jobs: Promise<Job<OutboundJobData>>[] = [];
  
  for (const msg of messages) {
    const jobId = `out:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
    jobs.push(
      queue.add(
        jobId,
        {
          waId,
          waBusinessNumber,
          messageType: msg.type,
          payload: msg.payload,
          orgId,
          sessionId,
        },
        {
          jobId,
        }
      )
    );
  }
  
  return Promise.all(jobs);
}
