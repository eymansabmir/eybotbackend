import { Job } from 'bullmq';

export interface OutboundMessageJob {
  type: string;
  payload: Record<string, any>;
}

export interface IOutboundQueue {
  enqueue(
    waId: string,
    waBusinessNumber: string,
    messages: OutboundMessageJob[],
    orgId: string,
    sessionId?: string
  ): Promise<Job[]>;
}
