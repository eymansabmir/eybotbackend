import { Request, Response, NextFunction } from 'express';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import type { IWorkerPlugin } from '../../plugins/worker';
import { EXCHANGES } from '../../plugins/worker';
import { ValidationError } from '../../utils/errors';
import type { WhatsAppWebhookPayload } from '../../plugins/whatsapp';
import type { InboundJob } from '../../plugins/worker/jobs';

export class WhatsAppWebhookController {
  constructor(
    private readonly whatsappPlugin: IWhatsAppPlugin,
    private readonly workerPlugin: IWorkerPlugin,
  ) {}

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

  handle = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT / route param
      if (!orgId) throw new ValidationError('orgId is required');

      // Return 200 immediately — Meta requires a fast response
      res.status(200).json({ status: 'accepted' });

      const payload = req.body as WhatsAppWebhookPayload;
      console.log(JSON.stringify(payload, null, 2));

      const message = this.whatsappPlugin.normalizer.normalize(orgId, payload);
      if (!message) return;

      const isDuplicate = await this.whatsappPlugin.deduplicator.isDuplicate(message.messageId);
      if (isDuplicate) {
        console.log(`[Webhook] Duplicate message ${message.messageId} ignored`);
        return;
      }

      const job: InboundJob = { orgId, message };
      await this.workerPlugin.publish(EXCHANGES.INBOUND, job);
      console.log(`[Webhook] Enqueued message ${message.messageId} for org ${orgId}`);
    } catch (err) {
      console.error('[Webhook] Error processing webhook:', err);
    }
  };
}
