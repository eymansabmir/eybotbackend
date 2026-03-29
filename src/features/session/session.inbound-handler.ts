import type { IInboundHandler } from '../../plugins/worker/handlers.interface';
import type { InboundJob, OutboundJob } from '../../plugins/worker/jobs';
import type { IFlowRepository } from '../flow/flow.repository';
import type { ISessionRepository } from './session.repository';
import type { IEnginePlugin, ContactInfo } from '../../plugins/engine';
import type { IRedisPlugin } from '../../plugins/redis';
import type { IStoragePlugin } from '../../plugins/storage';
import type { IWhatsAppPlugin } from '../../plugins/whatsapp';
import { NodeType } from '../../schemas/node-types.enum';
import { Readable } from 'stream';
import { ValidationError } from '../../utils/errors';

const LOCK_PREFIX = 'wa:lock:';
const LOCK_TTL = 10; // seconds

export class SessionInboundHandler implements IInboundHandler {
  constructor(
    private readonly flowRepo: IFlowRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly enginePlugin: IEnginePlugin,
    private readonly redisPlugin: IRedisPlugin,
    private readonly storagePlugin: IStoragePlugin,
    private readonly whatsappPlugin: IWhatsAppPlugin,
  ) {}

  async process(job: InboundJob): Promise<OutboundJob[]> {
    const { orgId, message } = job;
    const { waId, waBusinessNumber, text } = message;

    const redis = this.redisPlugin.client;
    const lockKey = `${LOCK_PREFIX}${waBusinessNumber}:${waId}`;
    const lockValue = `inbound-${message.messageId}`;

    const locked = await acquireLock(redis, lockKey, lockValue, LOCK_TTL);
    if (!locked) {
      logger.warn({ waId, lockKey }, 'SessionInboundHandler: could not acquire lock, dropping message');
      throw new Error(`[SessionInboundHandler] Could not acquire lock for ${waId}`);
    }
    logger.debug({ waId, lockKey }, 'SessionInboundHandler: lock acquired');

    try {
      const contact: ContactInfo = {
        waId,
        name: message.contactName ?? waId,
        customFields: {},
      };

      const activeSession = await this.sessionRepo.findCurrentByWhatsApp(waBusinessNumber, waId);
      const outboundMessages: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let sessionId: string;

      if (activeSession) {
        // Resume existing session
        logger.info({ sessionId: activeSession.id, waId }, 'SessionInboundHandler: resuming active session');

        let userInput = text;
        if (activeSession.waitingFor?.type === 'choice' && message.interactiveOptionId) {
          userInput = message.interactiveOptionId;
        }

        if (activeSession.waitingFor?.type === 'file') {
          const hasMediaInput = Boolean(message.mediaId || message.mediaUrl);
          const textFallback = (text ?? '').trim();

          if (!hasMediaInput) {
            if (textFallback.length > 0) {
              userInput = textFallback;
              logger.info({ waId, sessionId: activeSession.id }, 'SessionInboundHandler: file wait accepted text fallback input');
            } else {
              return [{
                waId,
                waBusinessNumber,
                messageType: NodeType.SEND_TEXT,
                payload: { message: 'Please upload a file to continue, or send text input.' },
                orgId,
                sessionId: activeSession.id,
              }];
            }
          }

          if (hasMediaInput) {
            try {
              const mediaUrl = message.mediaUrl ?? await this.whatsappPlugin.getMediaUrl(message.mediaId!);
              const buffer = await this.whatsappPlugin.downloadMedia(mediaUrl);
              const mimeType = message.mediaMimeType ?? 'application/octet-stream';
              const originalName = message.mediaFilename ?? `${message.type}-${message.mediaId ?? Date.now()}`;

              const upload = await this.storagePlugin.uploadFile(
                {
                  fieldname: 'file',
                  originalname: originalName,
                  encoding: '7bit',
                  mimetype: mimeType,
                  size: buffer.length,
                  destination: '',
                  filename: '',
                  path: '',
                  buffer,
                  stream: Readable.from(buffer),
                },
                'uploads',
              );

              userInput = upload.url;
              logger.info({ waId, sessionId: activeSession.id, url: upload.url }, 'SessionInboundHandler: uploaded inbound file and mapped to userInput');
            } catch (err) {
              logger.error({ err, waId, mediaId: message.mediaId, mediaUrl: message.mediaUrl }, 'SessionInboundHandler: failed to process inbound file');
              return [{
                waId,
                waBusinessNumber,
                messageType: NodeType.SEND_TEXT,
                payload: { message: 'I could not process that file. Please try again with a supported attachment or send text input.' },
                orgId,
                sessionId: activeSession.id,
              }];
            }
          }
        }

        const flow = await this.flowRepo.findByIdOrFail(activeSession.flowId);
        
        let flowToExecute = flow;
        const language = activeSession.variables?.selected_language || (flow.settings as any)?.localization?.defaultLanguage;
        if (language) {
          const translation = await this.flowRepo.getTranslation(flow.id!, language);
          if (translation) {
            flowToExecute = flow.clone();
            flowToExecute.nodes = translation.translatedData as any;
          }
        }

        const result = await this.enginePlugin.resumeFlow(
          { sessionId: activeSession.id!, userInput: userInput ?? '' },
          flowToExecute,
          contact,
          activeSession,
          async (lang: string) => {
            const t = await this.flowRepo.getTranslation(flow.id!, lang);
            return t?.translatedData || null;
          }
        );

        await this.sessionRepo.update(result.session.id!, {
          status: result.session.status,
          currentNodeId: result.session.currentNodeId,
          variables: result.session.variables,
          history: result.session.history,
          waitingFor: result.session.waitingFor,
          isCurrent: result.session.isCurrent,
        });

        outboundMessages.push(...result.outboundMessages);
        sessionId = result.session.id!;
        logger.info({ sessionId, isFinished: result.isFinished }, 'SessionInboundHandler: session resumed');
      } else {
        // Match flow by keyword
        const tokens = (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        logger.debug({ waId, tokens }, 'SessionInboundHandler: matching keyword');

        let flow = null;
        for (const token of tokens) {
          flow = await this.flowRepo.findPublishedByOrgAndKeyword(orgId, token);
          if (flow) break;
        }

        if (!flow) {
          logger.warn({ waId, orgId, tokens }, 'SessionInboundHandler: no flow matched keyword');
          throw new ValidationError('No published flow matched the incoming message');
        }

        logger.info({ waId, flowId: flow.id }, 'SessionInboundHandler: starting new session from keyword match');

        await this.sessionRepo.clearCurrentFlags(waBusinessNumber, waId);
        
        let flowToExecute = flow;
        const language = (contact.customFields?.language as string | undefined) || (flow.settings as any)?.localization?.defaultLanguage;
        if (language) {
            const translation = await this.flowRepo.getTranslation(flow.id!, language);
            if (translation) {
                flowToExecute = flow.clone();
                flowToExecute.nodes = translation.translatedData as any;
            }
        }

        const result = await this.enginePlugin.startFlow(
          { orgId, flowId: flow.id!, waId, waBusinessNumber },
          flowToExecute,
          contact,
          async (lang: string) => {
            const t = await this.flowRepo.getTranslation(flow.id!, lang);
            return t?.translatedData || null;
          }
        );

        const saved = await this.sessionRepo.create(result.session);
        sessionId = saved.id!;

        await this.sessionRepo.update(sessionId, {
          status: result.session.status,
          currentNodeId: result.session.currentNodeId,
          variables: result.session.variables,
          history: result.session.history,
          waitingFor: result.session.waitingFor,
          isCurrent: result.session.isCurrent,
        });

        outboundMessages.push(...result.outboundMessages);
        logger.info({ sessionId, flowId: flow.id }, 'SessionInboundHandler: new session started');
      }

      return outboundMessages.map(msg => ({
        waId,
        waBusinessNumber,
        messageType: msg.type,
        payload: msg.payload,
        orgId,
        sessionId,
      }));
    } finally {
      await releaseLock(redis, lockKey, lockValue);
      logger.debug({ waId, lockKey }, 'SessionInboundHandler: lock released');
    }
  }
}

async function acquireLock(redis: any, key: string, value: string, ttl: number): Promise<boolean> {
  const result = await redis.set(key, value, 'EX', ttl, 'NX');
  return result === 'OK';
}

async function releaseLock(redis: any, key: string, value: string): Promise<void> {
  const current = await redis.get(key);
  if (current === value) await redis.del(key);
}
