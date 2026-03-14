import type { NormalizedInboundMessage } from '../whatsapp/normalizer';

/** Job pushed to wa.inbound exchange by the webhook controller. */
export interface InboundJob {
  orgId: string;
  message: NormalizedInboundMessage;
}

/** Job pushed to wa.outbound exchange after flow execution produces messages. */
export interface OutboundJob {
  waId: string;
  waBusinessNumber: string;
  messageType: string;
  payload: Record<string, unknown>;
  orgId: string;
  sessionId?: string;
}

/** Stub for future campaign broadcast jobs. */
export interface CampaignJob {
  campaignId: string;
  orgId: string;
  recipients: string[]; // waIds
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

export interface ImportJob {
  campaignId: string;
  campaignVersionId: string;
  filePath: string;
  orgId: string;
  /** When true, the import consumer publishes CAMPAIGN_START after import completes. */
  autoStart: boolean;
}

export interface DispatchJob {
  campaignId: string;
  campaignVersionId: string;
  orgId: string;
}

export interface RecipientJob {
  campaignId: string;
  campaignVersionId: string;
  recipientId: string;
  waId: string;
  variables: Record<string, any>;
  orgId: string;
}
