import type { NormalizedInboundMessage } from '../whatsapp/normalizer';

/** Job pushed to wa.inbound exchange by the webhook controller. */
export interface InboundJob {
  orgId: string;
  credentialId?: string;
  /**
   * When true (BSP / Interakt env-scoped webhook), skip credential DB lookup
   * and match published flows for the org without requiring a WHATSAPP_CLOUD credential row.
   */
  skipCredentialLookup?: boolean;
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
  /** When set, the outbound consumer saves Meta's message_id back to CampaignRecipient after sending. */
  campaignRecipientId?: string;
}

/** Job pushed to wa.status exchange when Meta sends a delivery/read status callback. */
export interface StatusUpdateJob {
  messageId: string;
  status: 'delivered' | 'read';
  timestamp: number;
}

/** Job pushed to wa.flow_response when Interakt delivers a Meta Flow (nfm_reply) submission. */
export interface FlowResponseJob {
  orgId: string;
  credentialId?: string;
  waBusinessNumber: string;
  providerMessageId: string;
  waId: string;
  interaktFlowId: string;
  templateName?: string;
  callbackData?: string;
  contextMessageId?: string;
  flowToken?: string;
  responseJson: Record<string, unknown>;
  rawPayload: unknown;
  submittedAt: number;
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

export interface RenudgeJob {
  sessionId: string;
  attempt: number;
}

export interface VoiceIngestJob {
  jobId: string;
  tenantId: string;
  entityType: string;
  filePath?: string;
  records?: Array<Record<string, unknown>>;
  retryCount?: number;
  maxRetries?: number;
}

export interface VoiceCampaignJob {
  jobId: string;
  tenantId: string;
  routingConfigId: string;
  entityTypes: string[];
  retryCount?: number;
  maxRetries?: number;
}

export interface TriggerJob {
  orgId: string;
  botId: string;
  campaignName: string;
  executionMode: 'NOW' | 'SCHEDULED';
  executeAt?: string;
  isSystem?: boolean;
  data: Array<{
    to: string;
    variables: Record<string, unknown>;
  }>;
}
