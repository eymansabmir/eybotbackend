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

    logger.info({ mode }, 'WhatsApp webhook verification attempt');

    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      logger.info('WhatsApp webhook verified successfully');
      res.status(200).send(challenge);
      return;
    }
    logger.warn({ mode }, 'WhatsApp webhook verification failed (token mismatch or wrong mode)');
    res.status(403).send('Forbidden');
  };

  handle = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      const orgId = '68b08633907a113536238290'; // TODO: derive from JWT / route param
      if (!orgId) throw new ValidationError('orgId is required');

      // Return 200 immediately — Meta requires a fast response
      res.status(200).json({ status: 'accepted' });

      const payload = req.body as WhatsAppWebhookPayload;
      logger.debug({ payload }, 'WhatsApp webhook payload received');

      const message = this.whatsappPlugin.normalizer.normalize(orgId, payload);
      if (!message) {
        logger.debug('Webhook payload had no actionable message, skipping');
        return;
      }

      const isDuplicate = await this.whatsappPlugin.deduplicator.isDuplicate(message.messageId);
      if (isDuplicate) {
        logger.info({ messageId: message.messageId }, 'Duplicate message ignored');
        return;
      }

      const job: InboundJob = { orgId, message };
      await this.workerPlugin.publish(EXCHANGES.INBOUND, job);
      logger.info({ messageId: message.messageId, orgId }, 'Inbound message enqueued');
    } catch (err) {
      logger.error({ err }, 'Error processing WhatsApp webhook');
    }
  };
}
