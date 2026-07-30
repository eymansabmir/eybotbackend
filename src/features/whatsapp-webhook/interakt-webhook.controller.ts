import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import type { IWorkerPlugin } from '../../plugins/worker';
import { EXCHANGES } from '../../plugins/worker';
import type { InboundJob, StatusUpdateJob, FlowResponseJob } from '../../plugins/worker/jobs';
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

function parseBspPathIds(pathname: string): { workspaceId?: string; credentialId?: string } {
  // /api/v1/workspaces/:workspaceId/whatsapp/:credentialId/webhook
  const match = pathname.match(
    /\/workspaces\/([^/]+)\/whatsapp\/([^/]+)\/webhook\/?$/i,
  );
  if (!match) return {};
  return { workspaceId: match[1], credentialId: match[2] };
}

export class InteraktWebhookController {
  private readonly normalizer = new InteraktNormalizer();

  constructor(
    private readonly whatsappPlugin: IWhatsAppPlugin,
    private readonly workerPlugin: IWorkerPlugin,
    private readonly credentialRepo: ICredentialRepository,
  ) {}

  /** Standard Interakt routes — may resolve org/credential via DB. */
  handle = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!this.verifySignature(req as RequestWithRawBody, res)) return;

      const payload = req.body as InteraktWebhookPayload;
      this.logWebhookPayload('Interakt', payload);

      const context = await this.resolveInboundContext(req, payload);
      if (!context) {
        res.status(200).json({ status: 'ignored' });
        return;
      }

      await this.acceptAndEnqueue(res, context, payload);
    } catch (err) {
      logger.error({ err }, 'Error processing Interakt webhook');
      if (!res.headersSent) {
        res.status(200).json({ status: 'ignored' });
      }
    }
  };

  /**
   * Env-scoped BSP path (BSP_WEBHOOK_PATH). Skips credential DB lookup;
   * uses INTERAKT_* / DEFAULT_ORG_ID and ids parsed from the path.
   */
  handleBsp = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    try {
      if (!this.verifySignature(req as RequestWithRawBody, res)) return;

      const payload = req.body as InteraktWebhookPayload;
      this.logWebhookPayload('BSP Interakt', payload);

      const context = this.resolveEnvScopedContext(req);
      if (!context) {
        res.status(200).json({ status: 'ignored' });
        return;
      }

      await this.acceptAndEnqueue(res, context, payload);
    } catch (err) {
      logger.error({ err }, 'Error processing BSP Interakt webhook');
      if (!res.headersSent) {
        res.status(200).json({ status: 'ignored' });
      }
    }
  };

  private logWebhookPayload(label: string, payload: InteraktWebhookPayload): void {
    logger.info(
      {
        type: payload.type,
        payload,
        raw: JSON.stringify(payload),
      },
      `${label} webhook received (full payload)`,
    );
  }

  private async acceptAndEnqueue(
    res: Response,
    context: ResolvedInboundContext,
    payload: InteraktWebhookPayload,
  ): Promise<void> {
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

    const flowResponse = this.normalizer.extractFlowResponse(payload);
    if (flowResponse) {
      const isDuplicate = await this.whatsappPlugin.deduplicator.isDuplicate(
        // Include event type so an early message_received cannot block message_api_flow_response.
        `flow:${payload.type}:${flowResponse.providerMessageId}`,
      );
      if (isDuplicate) {
        logger.info(
          { messageId: flowResponse.providerMessageId },
          'Interakt flow response duplicate ignored',
        );
        return;
      }

      const job: FlowResponseJob = {
        orgId: context.orgId,
        credentialId: context.credentialId,
        waBusinessNumber: context.waBusinessNumber,
        providerMessageId: flowResponse.providerMessageId,
        waId: flowResponse.waId,
        interaktFlowId: flowResponse.interaktFlowId,
        templateName: flowResponse.templateName,
        callbackData: flowResponse.callbackData,
        contextMessageId: flowResponse.contextMessageId,
        flowToken: flowResponse.flowToken,
        responseJson: flowResponse.responseJson,
        rawPayload: flowResponse.rawPayload,
        submittedAt: flowResponse.submittedAt,
      };
      await this.workerPlugin.publish(EXCHANGES.WA_FLOW_RESPONSE, job);
      logger.info(
        {
          messageId: flowResponse.providerMessageId,
          orgId: context.orgId,
          interaktFlowId: flowResponse.interaktFlowId,
          templateName: flowResponse.templateName,
        },
        'Interakt flow response enqueued',
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
  }

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

  /** Env/path only — no credential repository. */
  private resolveEnvScopedContext(req: Request): ResolvedInboundContext | undefined {
    const pathIds = parseBspPathIds(req.path || env.BSP_WEBHOOK_PATH || '');
    const orgId =
      env.INTERAKT_ORG_ID?.trim() ||
      process.env.DEFAULT_ORG_ID?.trim() ||
      pathIds.workspaceId ||
      '';
    const credentialId =
      env.INTERAKT_CREDENTIAL_ID?.trim() || pathIds.credentialId || undefined;
    const waBusinessNumber =
      env.INTERAKT_WA_BUSINESS_NUMBER?.trim() ||
      env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
      'interakt';

    if (!orgId) {
      logger.warn(
        'BSP Interakt webhook: set INTERAKT_ORG_ID (or DEFAULT_ORG_ID) for inbound scoping',
      );
      return undefined;
    }

    logger.info(
      { orgId, credentialId, waBusinessNumber, path: req.path },
      'BSP Interakt webhook: using env-scoped context (credential lookup bypassed)',
    );

    return { orgId, credentialId, waBusinessNumber };
  }

  private async resolveInboundContext(
    req: Request,
    _payload: InteraktWebhookPayload,
  ): Promise<ResolvedInboundContext | undefined> {
    const bypass =
      env.BSP_WEBHOOK_BYPASS_CREDENTIAL_LOOKUP === 'true' ||
      Boolean(env.BSP_WEBHOOK_PATH?.trim());
    if (bypass) {
      return this.resolveEnvScopedContext(req);
    }

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
