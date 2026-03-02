import { Request, Response, NextFunction } from 'express';
import { WhatsAppNormalizer } from '../whatsapp/normalizer';
import { WhatsAppDeduplicator } from '../whatsapp/deduplicator';
import { enqueueInboundMessage } from '../lib/queue';
import { getRedisClient } from '../lib/redis';
import { ValidationError } from '../utils/errors';
import type { WhatsAppWebhookPayload } from '../whatsapp/types';

export class WhatsAppWebhookController {
  private readonly normalizer: WhatsAppNormalizer;
  private readonly deduplicator: WhatsAppDeduplicator;

  constructor() {
    this.normalizer = new WhatsAppNormalizer();
    const redis = getRedisClient();
    this.deduplicator = new WhatsAppDeduplicator(redis);
  }

  verify = async (req: Request, res: Response): Promise<void> => {
    const mode = req.query['hub.mode'];
    const challenge = req.query['hub.challenge'];
    const token = req.query['hub.verify_token'];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      res.status(200).send(challenge);
      return;
    }

    res.status(403).send('Forbidden');
  };

  handle = async (req: Request, res: Response, _: NextFunction): Promise<void> => {
    try {
      const orgId = "68b08633907a113536238290"
      // String(req.params['orgId']);
      if (!orgId) {
        throw new ValidationError('orgId param is required');
      }

      // Return 200 immediately to Meta (async processing)
      res.status(200).json({ status: 'accepted' });

      // Process asynchronously
      const payload = req.body as WhatsAppWebhookPayload;

      console.log(JSON.stringify(payload, null,2))
      
      // Normalize payload
      const message = this.normalizer.normalize(orgId, payload);
      if (!message) {
        return;
      }

      // Check for duplicates
      const isDuplicate = await this.deduplicator.isDuplicate(message.messageId);
      if (isDuplicate) {
        console.log(`[Webhook] Duplicate message ${message.messageId} ignored`);
        return;
      }

      // Enqueue for processing
      await enqueueInboundMessage(message);
      console.log(`[Webhook] Enqueued message ${message.messageId} for ${orgId}`);

    } catch (error) {
      // Log error but don't send error response (we already sent 200)
      console.error('[Webhook] Error processing webhook:', error);
    }
  };
}
