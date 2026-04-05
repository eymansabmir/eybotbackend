import { Request, Response, NextFunction } from 'express';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp/whatsapp.interface';
import type { IWorkerPlugin } from '../../plugins/worker/worker.interface';
import { EXCHANGES } from '../../plugins/worker/worker.interface';
import type { WhatsAppWebhookPayload } from '../../plugins/whatsapp/normalizer';
import type { InboundJob } from '../../plugins/worker/jobs';
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';

const RESERVED_ORG_ROUTE_VALUES = new Set(['webhook']);

type ResolvedInboundContext = {
  orgId: string;
  credentialId?: string;
};

export class WhatsAppWebhookController {
  constructor(
    private readonly whatsappPlugin: IWhatsAppPlugin,
    private readonly workerPlugin: IWorkerPlugin,
    private readonly credentialRepo: ICredentialRepository,
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
      const payload = req.body as WhatsAppWebhookPayload;
      const context = await this.resolveInboundContext(req, payload);
      if (!context) {
        // Meta retries non-2xx responses aggressively; ack and drop unknown-account traffic.
        res.status(200).json({ status: 'ignored' });
        return;
      }

      // Return 200 immediately — Meta requires a fast response
      res.status(200).json({ status: 'accepted' });

      logger.debug({ payload }, 'WhatsApp webhook payload received');

      const message = this.whatsappPlugin.normalizer.normalize(context.orgId, payload);
      if (!message) {
        logger.debug('Webhook payload had no actionable message, skipping');
        return;
      }

      const isDuplicate = await this.whatsappPlugin.deduplicator.isDuplicate(message.messageId);
      if (isDuplicate) {
        logger.info({ messageId: message.messageId }, 'Duplicate message ignored');
        return;
      }

      const job: InboundJob = { orgId: context.orgId, credentialId: context.credentialId, message };
      await this.workerPlugin.publish(EXCHANGES.INBOUND, job);
      logger.info({ messageId: message.messageId, orgId: context.orgId, credentialId: context.credentialId }, 'Inbound message enqueued');
    } catch (err) {
      logger.error({ err }, 'Error processing WhatsApp webhook');
      if (!res.headersSent) {
        res.status(200).json({ status: 'ignored' });
      }
    }
  };

  private async resolveInboundContext(req: Request, payload: WhatsAppWebhookPayload): Promise<ResolvedInboundContext | undefined> {
    const routeOrgId = typeof req.params['orgId'] === 'string' ? req.params['orgId'].trim() : '';

    const waBusinessNumber =
      payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ??
      payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    if (routeOrgId && !RESERVED_ORG_ROUTE_VALUES.has(routeOrgId.toLowerCase())) {
      if (!waBusinessNumber) {
        return { orgId: routeOrgId };
      }

      const scopedCredential = await this.credentialRepo.findActiveWhatsAppByBusinessNumberForOrg(routeOrgId, waBusinessNumber);
      if (scopedCredential) {
        return { orgId: routeOrgId, credentialId: scopedCredential.id };
      }

      logger.warn({ routeOrgId, waBusinessNumber }, 'Route orgId does not own incoming business number, falling back to global resolution');
    }

    if (!waBusinessNumber) {
      logger.warn('WhatsApp webhook payload missing metadata.phone_number_id/display_phone_number');
      return undefined;
    }

    const credential = await this.credentialRepo.findActiveWhatsAppByBusinessNumber(waBusinessNumber);
    if (!credential) {
      logger.warn({ waBusinessNumber }, 'No active WhatsApp credential found for inbound business number');
      return undefined;
    }

    return { orgId: credential.orgId, credentialId: credential.id };
  }
}
