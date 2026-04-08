export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: WhatsAppWebhookValue }>;
  }>;
}

export interface WhatsAppStatusEntry {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppWebhookValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatusEntry[];
}

export interface WhatsAppMessage {
  from?: string;
  id: string;
  timestamp?: string;
  type: string;
  context?: { id?: string };
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { title?: string; id?: string };
    list_reply?: { title?: string; id?: string; description?: string };
  };
  image?: { mime_type?: string; id?: string; url?: string; caption?: string };
  audio?: { mime_type?: string; id?: string; url?: string; voice?: boolean };
  voice?: { mime_type?: string; id?: string; url?: string };
  video?: { mime_type?: string; id?: string; url?: string; caption?: string };
  document?: { mime_type?: string; id?: string; url?: string; caption?: string; filename?: string };
  sticker?: { mime_type?: string; id?: string; url?: string; animated?: boolean };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  reaction?: { message_id?: string; emoji?: string };
  order?: { catalog_id?: string; text?: string };
  system?: { body?: string; wa_id?: string; type?: string };
}

export interface NormalizedInboundMessage {
  orgId: string;
  messageId: string;
  waId: string;
  waBusinessNumber: string;
  text: string;
  type: string;
  timestamp: number;
  contactName?: string;
  interactiveOptionId?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  mediaFilename?: string;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { messageId: string; emoji?: string };
  /** The Meta message_id that this inbound message is replying to (from message.context.id). */
  contextMessageId?: string;
}

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker', 'voice']);

export class WhatsAppNormalizer {
  normalize(orgId: string, payload: WhatsAppWebhookPayload): NormalizedInboundMessage | null {
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    if (!value) return null;

    const message = value.messages?.[0];
    const contact = value.contacts?.[0];
    const metadata = value.metadata;

    if (!message) return null;

    const waId = contact?.wa_id ?? message.from;
    const waBusinessNumber = metadata?.phone_number_id ?? metadata?.display_phone_number;
    if (!waId || !waBusinessNumber) return null;

    const text = this.extractText(message);
    const nonText = new Set(['interactive', 'button', 'location', 'contacts', 'reaction', 'order', 'system', ...MEDIA_TYPES]);
    if (!text && !nonText.has(message.type)) return null;

    const base: NormalizedInboundMessage = {
      orgId,
      messageId: message.id,
      waId,
      waBusinessNumber,
      text: text?.trim() ?? '',
      type: message.type,
      timestamp: message.timestamp ? Number(message.timestamp) * 1000 : Date.now(),
    };

    const contactName = contact?.profile?.name;
    if (contactName !== undefined) base.contactName = contactName;

    const interactiveId = this.extractInteractiveId(message);
    if (interactiveId !== undefined) {
      base.interactiveOptionId = interactiveId;
      logger.info({ interactiveOptionId: interactiveId }, 'WhatsAppNormalizer: extracted interactiveOptionId');
    }

    if (message.type === 'interactive') {
      logger.info({ interactive: message.interactive }, 'WhatsAppNormalizer: raw interactive data');
    }

    Object.assign(base, this.extractMedia(message), this.extractLocation(message), this.extractReaction(message));

    if (message.context?.id) base.contextMessageId = message.context.id;

    return base;
  }

  private extractText(message: WhatsAppMessage): string | null {
    if (message.type === 'text') return message.text?.body ?? null;
    if (message.type === 'button') return message.button?.text ?? null;
    if (message.type === 'interactive' && message.interactive) {
      return (
        message.interactive.button_reply?.title ??
        message.interactive.list_reply?.title ??
        (message.interactive as any).carousel_reply?.button_reply?.title ??
        null
      );
    }
    if (message.type === 'location') return message.location?.name ?? 'Location shared';
    if (message.type === 'contacts') return message.contacts?.[0]?.name?.formatted_name ?? 'Contact shared';
    if (message.type === 'reaction') return message.reaction?.emoji ?? '';
    if (message.type === 'order') return message.order?.text ?? 'Order placed';
    if (message.type === 'system') return message.system?.body ?? null;
    if (MEDIA_TYPES.has(message.type)) {
      const asset = (message as any)[message.type] as { caption?: string } | undefined;
      return asset?.caption ?? message.type;
    }
    return null;
  }

  private extractInteractiveId(message: WhatsAppMessage): string | undefined {
    if (message.type === 'button') {
      return message.button?.payload;
    }
    if (message.type === 'interactive' && message.interactive) {
      return (
        message.interactive.button_reply?.id ??
        message.interactive.list_reply?.id ??
        (message.interactive as any).carousel_reply?.button_reply?.id
      );
    }
    return undefined;
  }

  private extractMedia(message: WhatsAppMessage): Partial<NormalizedInboundMessage> {
    if (!MEDIA_TYPES.has(message.type)) return {};
    const asset = (message as any)[message.type] as { id?: string; url?: string; mime_type?: string; caption?: string; filename?: string } | undefined;
    if (!asset) return {};
    const result: Partial<NormalizedInboundMessage> = {};
    if (asset.id !== undefined) result.mediaId = asset.id;
    if (asset.url !== undefined) result.mediaUrl = asset.url;
    if (asset.mime_type !== undefined) result.mediaMimeType = asset.mime_type;
    if (asset.caption !== undefined) result.mediaCaption = asset.caption;
    if (asset.filename !== undefined) result.mediaFilename = asset.filename;
    return result;
  }

  private extractLocation(message: WhatsAppMessage): Partial<NormalizedInboundMessage> {
    if (message.type !== 'location' || !message.location) return {};
    const { latitude, longitude, name, address } = message.location;
    if (latitude === undefined || longitude === undefined) return {};
    const loc: NormalizedInboundMessage['location'] = { latitude, longitude };
    if (name !== undefined) loc!.name = name;
    if (address !== undefined) loc!.address = address;
    return { location: loc };
  }

  private extractReaction(message: WhatsAppMessage): Partial<NormalizedInboundMessage> {
    if (message.type !== 'reaction' || !message.reaction?.message_id) return {};
    const rxn: NormalizedInboundMessage['reaction'] = { messageId: message.reaction.message_id };
    if (message.reaction.emoji !== undefined) rxn!.emoji = message.reaction.emoji;
    return { reaction: rxn };
  }
}
