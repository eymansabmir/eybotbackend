import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import type { IWorkerPlugin } from '../../plugins/worker';
import { EXCHANGES } from '../../plugins/worker';
import type { InboundJob, StatusUpdateJob } from '../../plugins/worker/jobs';
import {
  InteraktNormalizer,
  type InteraktWebhookPayload,
} from '../../plugins/whatsapp/interakt/interakt.normalizer';
import { verifyInteraktSignature } from '../../plugins/whatsapp/interakt/interakt-signature';

const RESERVED_ORG_ROUTE_VALUES = new Set(['webhook']);

type ResolvedInboundContext = {
  orgId: string;
  credentialId?: string;
  waBusinessNumber: string;
};

type RequestWithRawBody = Request & { rawBody?: Buffer };

export class InteraktWebhookController {
  private readonly normalizer = new InteraktNormalizer();

  constructor(
    private readonly whatsappPlugin: IWhatsAppPlugin,
    private readonly workerPlugin: IWorkerPlugin,
    private readonly credentialRepo: ICredentialRepository,
  ) {}

  handle = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!this.verifySignature(req as RequestWithRawBody, res)) return;

      const payload = req.body as InteraktWebhookPayload;
      logger.info({ type: payload.type }, 'Interakt webhook received');
      logger.debug({ payload }, 'Interakt webhook payload');

      const context = await this.resolveInboundContext(req, payload);
      if (!context) {
        res.status(200).json({ status: 'ignored' });
        return;
      }

      // Ack fast — Interakt expects 200 within ~3s
      res.status(200).json({ status: 'accepted' });

      const status = this.normalizer.extractStatus(payload);
      if (status) {
        const job: StatusUpdateJob = {
          messageId: status.messageId,
          status: status.status,
          timestamp: status.timestamp,
        };
        await this.workerPlugin.publish(EXCHANGES.WA_STATUS, job);
        logger.info(
          { messageId: status.messageId, status: status.status },
          'Interakt status update enqueued',
        );
        return;
      }

      const message = this.normalizer.normalize(context.orgId, payload, context.waBusinessNumber);
      if (!message) {
        logger.debug({ type: payload.type }, 'Interakt webhook had no actionable inbound message');
        return;
      }

      const isDuplicate = await this.whatsappPlugin.deduplicator.isDuplicate(message.messageId);
      if (isDuplicate) {
        logger.info({ messageId: message.messageId }, 'Interakt duplicate message ignored');
        return;
      }

      const job: InboundJob = {
        orgId: context.orgId,
        credentialId: context.credentialId,
        message,
      };
      await this.workerPlugin.publish(EXCHANGES.INBOUND, job);
      logger.info(
        {
          messageId: message.messageId,
          orgId: context.orgId,
          credentialId: context.credentialId,
          type: message.type,
        },
        'Interakt inbound message enqueued',
      );
    } catch (err) {
      logger.error({ err }, 'Error processing Interakt webhook');
      if (!res.headersSent) {
        res.status(200).json({ status: 'ignored' });
      }
    }
  };

  private verifySignature(req: RequestWithRawBody, res: Response): boolean {
    const secret = env.INTERAKT_WEBHOOK_SECRET;
    if (!secret) {
      if (env.NODE_ENV === 'production') {
        logger.error('INTERAKT_WEBHOOK_SECRET is required in production');
        res.status(401).json({ status: 'unauthorized' });
        return false;
      }
      logger.warn('INTERAKT_WEBHOOK_SECRET not set — skipping Interakt signature verification');
      return true;
    }

    const signature =
      (req.header('Interakt-Signature') ?? req.header('interakt-signature')) || undefined;
    const rawBody = req.rawBody;
    if (!rawBody) {
      logger.error('Interakt webhook missing rawBody for signature verification');
      res.status(401).json({ status: 'unauthorized' });
      return false;
    }

    if (!verifyInteraktSignature(secret, rawBody, signature)) {
      logger.warn('Interakt webhook signature verification failed');
      res.status(401).json({ status: 'unauthorized' });
      return false;
    }
    return true;
  }

  private async resolveInboundContext(
    req: Request,
    _payload: InteraktWebhookPayload,
  ): Promise<ResolvedInboundContext | undefined> {
    const routeOrgId = typeof req.params['orgId'] === 'string' ? req.params['orgId'].trim() : '';
    const waBusinessNumber =
      env.INTERAKT_WA_BUSINESS_NUMBER?.trim() ||
      env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
      '';

    if (!waBusinessNumber) {
      logger.warn(
        'Interakt webhook: set INTERAKT_WA_BUSINESS_NUMBER (or WHATSAPP_PHONE_NUMBER_ID) for session/credential scoping',
      );
      const fallbackBusiness = 'interakt';
      if (routeOrgId && !RESERVED_ORG_ROUTE_VALUES.has(routeOrgId.toLowerCase())) {
        return { orgId: routeOrgId, waBusinessNumber: fallbackBusiness };
      }
      if (env.INTERAKT_ORG_ID?.trim()) {
        return { orgId: env.INTERAKT_ORG_ID.trim(), waBusinessNumber: fallbackBusiness };
      }
      return undefined;
    }

    if (routeOrgId && !RESERVED_ORG_ROUTE_VALUES.has(routeOrgId.toLowerCase())) {
      const scoped = await this.credentialRepo.findActiveWhatsAppByBusinessNumberForOrg(
        routeOrgId,
        waBusinessNumber,
      );
      if (scoped) {
        return { orgId: routeOrgId, credentialId: scoped.id, waBusinessNumber };
      }
      // Org is explicit in the Interakt webhook URL — trust it even without credential match.
      logger.warn(
        { routeOrgId, waBusinessNumber },
        'Interakt: no credential for org+business number; using route orgId',
      );
      return { orgId: routeOrgId, waBusinessNumber };
    }

    const credential = await this.credentialRepo.findActiveWhatsAppByBusinessNumber(waBusinessNumber);
    if (credential) {
      return { orgId: credential.orgId, credentialId: credential.id, waBusinessNumber };
    }

    if (env.INTERAKT_ORG_ID?.trim()) {
      return { orgId: env.INTERAKT_ORG_ID.trim(), waBusinessNumber };
    }

    logger.warn(
      { waBusinessNumber },
      'Interakt: no active WhatsApp credential and INTERAKT_ORG_ID not set',
    );
    return undefined;
  }
}
