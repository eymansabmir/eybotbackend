import { Request, Response, NextFunction } from 'express';
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import type { IWorkerPlugin } from '../../plugins/worker';
import { EXCHANGES } from '../../plugins/worker';
import type { WhatsAppWebhookPayload } from '../../plugins/whatsapp';
import type { InboundJob, StatusUpdateJob } from '../../plugins/worker/jobs';

const RESERVED_ORG_ROUTE_VALUES = new Set(['webhook']);

type ResolvedInboundContext = {
  orgId: string;
  credentialId?: string;
  skipCredentialLookup?: boolean;
};

/** /api/v1/workspaces/:orgId/whatsapp/:credentialId/webhook */
export function parseWorkspaceWebhookPath(pathname: string): {
  orgId?: string;
  credentialId?: string;
} {
  const match = pathname.match(/\/workspaces\/([^/]+)\/whatsapp\/([^/]+)(?:\/webhook)?\/?$/i);
  if (!match) return {};
  return { orgId: match[1], credentialId: match[2] };
}

export function resolveRequestWebhookPath(req: Request): string {
  const base = req.baseUrl ?? '';
  const path = req.path ?? '';
  return `${base}${path}`.replace(/\?.*$/, '');
}

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
      console.log("STEP 1: Webhook received raw payload from Meta", JSON.stringify(payload, null, 2));

      const context = await this.resolveInboundContext(req, payload);
      if (!context) {
        console.log("STEP 1.1: Webhook context resolution failed (unknown org/credential)");
        res.status(200).json({ status: 'ignored' });
        return;
      }

      res.status(200).json({ status: 'accepted' });
      console.log("STEP 2: Webhook context resolved, passing to worker queue", context);
      logger.debug({ payload }, 'WhatsApp webhook payload received');

      const message = this.whatsappPlugin.normalizer.normalize(context.orgId, payload);
      const value = payload.entry?.[0]?.changes?.[0]?.value;

      if (value?.statuses?.length) {
        for (const s of value.statuses) {
          if (s.status !== 'delivered' && s.status !== 'read') continue;
          const job: StatusUpdateJob = {
            messageId: s.id,
            status: s.status as 'delivered' | 'read',
            timestamp: Number(s.timestamp) * 1000,
          };
          await this.workerPlugin.publish(EXCHANGES.WA_STATUS, job);
          logger.info({ messageId: s.id, status: s.status }, 'Status update enqueued');
        }
        return;
      }

      if (!message) {
        logger.debug('Webhook payload had no actionable message, skipping');
        return;
      }

      const isDuplicate = await this.whatsappPlugin.deduplicator.isDuplicate(message.messageId);
      if (isDuplicate) {
        logger.info({ messageId: message.messageId }, 'Duplicate message ignored');
        return;
      }

      const job: InboundJob = {
        orgId: context.orgId,
        credentialId: context.credentialId,
        skipCredentialLookup: context.skipCredentialLookup,
        message,
      };
      await this.workerPlugin.publish(EXCHANGES.INBOUND, job);
      logger.info(
        {
          messageId: message.messageId,
          orgId: context.orgId,
          credentialId: context.credentialId,
          skipCredentialLookup: context.skipCredentialLookup,
        },
        'Inbound message enqueued',
      );
    } catch (err) {
      logger.error({ err }, 'Error processing WhatsApp webhook');
      if (!res.headersSent) {
        res.status(200).json({ status: 'ignored' });
      }
    }
  };

  private async resolveInboundContext(
    req: Request,
    payload: WhatsAppWebhookPayload,
  ): Promise<ResolvedInboundContext | undefined> {
    const pathIds = parseWorkspaceWebhookPath(resolveRequestWebhookPath(req));
    const routeOrgId = typeof req.params['orgId'] === 'string' ? req.params['orgId'].trim() : '';

    const waBusinessNumber =
      payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ??
      payload.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;

    if (pathIds.orgId && pathIds.credentialId) {
      const credential = await this.credentialRepo.findById(pathIds.orgId, pathIds.credentialId);
      if (credential?.isActive && !credential.revokedAt && credential.type === 'WHATSAPP_CLOUD') {
        return { orgId: pathIds.orgId, credentialId: credential.id };
      }

      logger.info(
        { orgId: pathIds.orgId, credentialId: pathIds.credentialId, waBusinessNumber },
        'Meta webhook: workspace path resolved — skipCredentialLookup (GenAI / flows without DB credential row)',
      );
      return {
        orgId: pathIds.orgId,
        credentialId: pathIds.credentialId,
        skipCredentialLookup: true,
      };
    }

    if (routeOrgId && !RESERVED_ORG_ROUTE_VALUES.has(routeOrgId.toLowerCase())) {
      if (!waBusinessNumber) {
        return { orgId: routeOrgId };
      }

      const scopedCredential = await this.credentialRepo.findActiveWhatsAppByBusinessNumberForOrg(
        routeOrgId,
        waBusinessNumber,
      );
      if (scopedCredential) {
        return { orgId: routeOrgId, credentialId: scopedCredential.id };
      }

      logger.warn(
        { routeOrgId, waBusinessNumber },
        'Route orgId does not own incoming business number, falling back to global resolution',
      );
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
