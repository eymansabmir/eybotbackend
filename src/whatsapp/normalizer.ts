import { NormalizedInboundMessage, WhatsAppMessage, WhatsAppWebhookPayload } from './types';

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker']);

export class WhatsAppNormalizer {
  normalize(orgId: string, payload: WhatsAppWebhookPayload): NormalizedInboundMessage | null {
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    if (!value) {
      console.warn('[Normalizer] Missing value in payload change');
      return null;
    }

    const message = value.messages?.[0];
    const contact = value.contacts?.[0];
    const metadata = value.metadata;

    if (!message) {
      console.warn('[Normalizer] No message found in payload value');
      return null;
    }

    const waId = contact?.wa_id ?? message.from;
    const waBusinessNumber = metadata?.phone_number_id ?? metadata?.display_phone_number;
    if (!waId || !waBusinessNumber) {
      console.warn('[Normalizer] Missing waId or waBusinessNumber', { waId, waBusinessNumber });
      return null;
    }

    const nonTextTypes = new Set(['interactive', 'location', 'contacts', 'reaction', 'order', 'system', ...MEDIA_TYPES]);
    const text = this.extractText(message);
    if (!text && !nonTextTypes.has(message.type)) {
      console.warn('[Normalizer] Unable to extract text from message', { messageType: message.type });
      return null;
    }

    const interactiveOptionId = this.extractInteractiveOptionId(message);

    const normalized: NormalizedInboundMessage = {
      orgId,
      messageId: message.id,
      waId,
      waBusinessNumber,
      text: text?.trim() ?? '',
      type: message.type,
      timestamp: message.timestamp ? Number(message.timestamp) * 1000 : Date.now(),
      contactName: contact?.profile?.name,
      interactiveOptionId,
      ...this.extractMediaFields(message),
      ...this.extractLocationFields(message),
      ...this.extractReactionFields(message),
    };

    return normalized;
  }

  private extractText(message: WhatsAppMessage): string | null {
    if (message.type === 'text' && message.text?.body) {
      return message.text.body;
    }

    if (message.type === 'button' && message.button?.text) {
      return message.button.text;
    }

    if (message.type === 'interactive' && message.interactive) {
      if (message.interactive.button_reply?.title) {
        return message.interactive.button_reply.title;
      }
      if (message.interactive.list_reply?.title) {
        return message.interactive.list_reply.title;
      }
    }

    if (message.type === 'location' && message.location) {
      return message.location.name ?? 'Location shared';
    }

    if (message.type === 'contacts' && message.contacts?.[0]) {
      return message.contacts[0].name?.formatted_name ?? 'Contact shared';
    }

    if (message.type === 'reaction' && message.reaction) {
      return message.reaction.emoji ?? '';
    }

    if (message.type === 'order' && message.order) {
      return message.order.text ?? 'Order placed';
    }

    if (message.type === 'system' && message.system?.body) {
      return message.system.body;
    }

    if (MEDIA_TYPES.has(message.type)) {
      const asset = (message as any)[message.type];
      return (asset?.caption as string | undefined) ?? message.type;
    }

    return null;
  }

  private extractInteractiveOptionId(message: WhatsAppMessage): string | undefined {
    if (message.type === 'interactive' && message.interactive) {
      return message.interactive.button_reply?.id ?? message.interactive.list_reply?.id;
    }
    return undefined;
  }

  private extractMediaFields(message: WhatsAppMessage): Partial<NormalizedInboundMessage> {
    if (!MEDIA_TYPES.has(message.type)) return {};
    const asset = (message as any)[message.type] as {
      id?: string;
      url?: string;
      mime_type?: string;
      caption?: string;
      filename?: string;
    } | undefined;
    if (!asset) return {};
    return {
      mediaId: asset.id,
      mediaUrl: asset.url,
      mediaMimeType: asset.mime_type,
      mediaCaption: asset.caption,
      mediaFilename: asset.filename,
    };
  }

  private extractLocationFields(message: WhatsAppMessage): Partial<NormalizedInboundMessage> {
    if (message.type !== 'location' || !message.location) return {};
    const { latitude, longitude, name, address } = message.location;
    if (latitude === undefined || longitude === undefined) return {};
    const loc: NormalizedInboundMessage['location'] = { latitude, longitude };
    if (name !== undefined) loc!.name = name;
    if (address !== undefined) loc!.address = address;
    return { location: loc };
  }

  private extractReactionFields(message: WhatsAppMessage): Partial<NormalizedInboundMessage> {
    if (message.type !== 'reaction' || !message.reaction?.message_id) return {};
    const rxn: NormalizedInboundMessage['reaction'] = { messageId: message.reaction.message_id };
    if (message.reaction.emoji !== undefined) rxn!.emoji = message.reaction.emoji;
    return { reaction: rxn };
  }
}
