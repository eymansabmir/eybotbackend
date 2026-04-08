import type { OutboundMessage } from '../engine/engine.interface';
import type { WhatsAppNormalizer } from './normalizer';
import type { WhatsAppDeduplicator } from './deduplicator';

export const WHATSAPP_PLUGIN = 'whatsapp' as const;

export interface IWhatsAppSender {
  /** Sends messages and returns the Meta message_id of the first message sent (undefined on failure). */
  sendMessages(waId: string, messages: OutboundMessage[], sessionId?: string): Promise<string | undefined>;
  uploadMedia(url: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker'): Promise<string>;
}

/**
 * WhatsAppPlugin is the central communication layer for the WhatsApp channel.
 * It handles:
 *  - Sending messages via Meta Cloud API (sender)
 *  - Parsing incoming webhook payloads (normalizer)
 *  - Deduplicating inbound messages (deduplicator)
 *
 * It does NOT own any workers or queues — those belong to WorkerPlugin.
 */
export interface IWhatsAppPlugin {
  readonly sender: IWhatsAppSender;
  readonly normalizer: WhatsAppNormalizer;
  readonly deduplicator: WhatsAppDeduplicator;
  getMediaUrl(mediaId: string): Promise<string>;
  downloadMedia(mediaUrl: string): Promise<Buffer>;
}
