export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: WhatsAppWebhookValue;
    }>;
  }>;
}

export interface WhatsAppWebhookValue {
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: WhatsAppMessage[];
}

export interface WhatsAppMediaAsset {
  mime_type?: string;
  sha256?: string;
  id?: string;
  url?: string;
}

export interface WhatsAppMessage {
  from?: string;
  id: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { title?: string; id?: string };
    list_reply?: { title?: string; id?: string; description?: string };
  };
  image?: WhatsAppMediaAsset & { caption?: string };
  audio?: WhatsAppMediaAsset & { voice?: boolean };
  video?: WhatsAppMediaAsset & { caption?: string };
  document?: WhatsAppMediaAsset & { caption?: string; filename?: string };
  sticker?: WhatsAppMediaAsset & { animated?: boolean };
  location?: {
    latitude?: number;
    longitude?: number;
    name?: string;
    address?: string;
    url?: string;
  };
  contacts?: Array<{
    name?: { formatted_name?: string; first_name?: string; last_name?: string };
    phones?: Array<{ phone?: string; wa_id?: string; type?: string }>;
    emails?: Array<{ email?: string; type?: string }>;
    org?: { company?: string; title?: string };
  }>;
  reaction?: {
    message_id?: string;
    emoji?: string;
  };
  order?: {
    catalog_id?: string;
    text?: string;
    product_items?: Array<{
      product_retailer_id?: string;
      quantity?: number;
      item_price?: number;
      currency?: string;
    }>;
  };
  system?: {
    body?: string;
    wa_id?: string;
    type?: string;
  };
  context?: {
    from?: string;
    id?: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
  };
  referral?: {
    source_url?: string;
    source_id?: string;
    source_type?: string;
    body?: string;
    headline?: string;
    ctwa_clid?: string;
  };
}

export interface NormalizedInboundMessage {
  orgId: string;
  messageId: string;
  waId: string;
  waBusinessNumber: string;
  text: string;
  type: string;
  timestamp: number;
  contactName?: string | undefined;
  interactiveOptionId?: string | undefined;
  mediaId?: string | undefined;
  mediaUrl?: string | undefined;
  mediaMimeType?: string | undefined;
  mediaCaption?: string | undefined;
  mediaFilename?: string | undefined;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  } | undefined;
  reaction?: {
    messageId: string;
    emoji?: string;
  } | undefined;
}

export interface InboundJobData {
  orgId: string;
  message: NormalizedInboundMessage;
}
