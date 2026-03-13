import type { InboundJob, OutboundJob, CampaignJob } from './jobs';

export const INBOUND_HANDLER = 'inbound.handler' as const;
export const CAMPAIGN_HANDLER = 'campaign.handler' as const;

export interface IInboundHandler {
  process(job: InboundJob): Promise<OutboundJob[]>;
}

export interface ICampaignHandler {
  process(job: CampaignJob): Promise<void>;
}
