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
import type { ICredentialRepository } from '../credentials/credentials.repository.interface';
import type { FlowEntity } from '../flow/flow.entity';
import { selectFlowByTrigger } from './trigger-selector';
import { hasProviderFallbackLanguage, syncFlowTranslations } from '../../plugins/i18n/syncTranslations';

type RedisLockClient = {
  set(key: string, value: string, ex: 'EX', ttl: number, nx: 'NX'): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

const LOCK_PREFIX = 'wa:lock:';
const LOCK_TTL = 10; // seconds

export class SessionInboundHandler implements IInboundHandler {
  private static readonly TRANSLATION_REFRESH_VERSION = '2026-04-05-language-label-refresh-v1';
  private static readonly TRANSLATION_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;
  private static readonly MAX_REFRESH_CACHE_KEYS = 5000;
  private static readonly refreshedTranslationKeys = new Map<string, number>();

  constructor(
    private readonly flowRepo: IFlowRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly enginePlugin: IEnginePlugin,
    private readonly redisPlugin: IRedisPlugin,
    private readonly storagePlugin: IStoragePlugin,
    private readonly whatsappPlugin: IWhatsAppPlugin,
    private readonly credentialRepo: ICredentialRepository,
  ) {}

  async process(job: InboundJob): Promise<OutboundJob[]> {
    const { orgId, credentialId, message } = job;
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

      const matchingCredential = await this.resolveMatchingCredential(orgId, waBusinessNumber, credentialId);
      if (!matchingCredential || !matchingCredential.isActive || matchingCredential.revokedAt) {
        logger.warn({ waId, waBusinessNumber }, 'SessionInboundHandler: no credential found matching this business number');
        return [];
      }

      const publishedFlows = await this.flowRepo.findByOrgId(orgId, 'published');
      const { scopedFlows, unboundFlows } = this.partitionFlowsByCredential(publishedFlows, matchingCredential.id);

      const activeSession = await this.sessionRepo.findCurrentByWhatsApp(waBusinessNumber, waId);
      const outboundMessages: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let sessionId: string;

      if (activeSession) {
        // Strict continuity: do not switch to another flow while current session is active.
        logger.info({ sessionId: activeSession.id, waId }, 'SessionInboundHandler: resuming active session');

        let userInput = text;
        if (activeSession.waitingFor?.type === 'choice' && message.interactiveOptionId) {
          userInput = message.interactiveOptionId;
        }

        if (activeSession.waitingFor?.type === 'location' && message.location) {
          userInput = JSON.stringify(message.location);
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
        const languageVariableKey = this.resolveLanguageVariableKey(flow);
        const currentNode = flow.nodes.find((node) => node.id === activeSession.currentNodeId);
        const isAtLanguageNode = currentNode?.type === NodeType.LANGUAGE;

        let flowToExecute = flow;
        const language = (activeSession.variables?.[languageVariableKey] as string | undefined)
          || flow.settings.localization?.defaultLanguage;
        if (language && !isAtLanguageNode) {
          const translatedNodes = await this.getTranslationWithLazySync(flow.id!, language);
          if (translatedNodes) {
            flowToExecute = flow.clone();
            flowToExecute.nodes = translatedNodes as unknown as FlowEntity['nodes'];
          }
        } else if (language && isAtLanguageNode) {
          logger.info(
            { sessionId: activeSession.id, flowId: flow.id, language },
            'SessionInboundHandler: skipping preloaded translation at language node to avoid stale language prompts'
          );
        }

        try {
          const result = await this.enginePlugin.resumeFlow(
            { sessionId: activeSession.id!, userInput: userInput ?? '' },
            flowToExecute,
            contact,
            activeSession,
            async (lang: string) => {
              return this.getTranslationWithLazySync(flow.id!, lang);
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
        } catch (err) {
          logger.error({ err, sessionId: activeSession.id, flowId: activeSession.flowId }, 'SessionInboundHandler: resume failed, marking current session as error');

          await this.sessionRepo.update(activeSession.id!, {
            status: 'error',
            waitingFor: undefined,
            isCurrent: false,
          });

          outboundMessages.push({
            type: NodeType.SEND_TEXT,
            payload: { message: 'Sorry, something went wrong in the current journey. Please send your trigger keyword again to restart.' },
          });
          sessionId = activeSession.id;
        }
      } else {
        // Match flow by advanced trigger config or legacy keywords
        logger.debug({ waId, waBusinessNumber }, 'SessionInboundHandler: matching flow for new session');

        const inboundText = text ?? '';
        const matchedFlow =
          selectFlowByTrigger(scopedFlows, inboundText) ??
          selectFlowByTrigger(unboundFlows, inboundText);

        if (!matchedFlow) {
          logger.info(
            {
              waId,
              orgId,
              text,
              scopedFlowCount: scopedFlows.length,
              unboundFlowCount: unboundFlows.length,
            },
            'SessionInboundHandler: no flow matched trigger conditions'
          );
          return [];
        }

        const started = await this.startNewSession(
          orgId,
          waId,
          waBusinessNumber,
          matchedFlow,
          contact,
        );
        outboundMessages.push(...started.outboundMessages);
        sessionId = started.sessionId;
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

  private async resolveMatchingCredential(
    orgId: string,
    waBusinessNumber: string,
    credentialId?: string,
  ) {
    if (credentialId) {
      return this.credentialRepo.findById(orgId, credentialId);
    }
    return this.credentialRepo.findActiveWhatsAppByBusinessNumberForOrg(orgId, waBusinessNumber);
  }

  private partitionFlowsByCredential(
    flows: FlowEntity[],
    credentialId: string,
  ): { scopedFlows: FlowEntity[]; unboundFlows: FlowEntity[] } {
    const scopedFlows = flows.filter((flow) => flow.settings.credentialId === credentialId);
    const unboundFlows = flows.filter((flow) => !flow.settings.credentialId);
    return { scopedFlows, unboundFlows };
  }

  private async startNewSession(
    orgId: string,
    waId: string,
    waBusinessNumber: string,
    matchedFlow: FlowEntity,
    contact: ContactInfo,
  ): Promise<{ outboundMessages: Array<{ type: string; payload: Record<string, unknown> }>; sessionId?: string }> {
    logger.info({ waId, flowId: matchedFlow.id }, 'SessionInboundHandler: starting new session from trigger match');

    await this.sessionRepo.clearCurrentFlags(waBusinessNumber, waId);

    let flowToExecute = matchedFlow;
    const hasLanguageNode = matchedFlow.nodes.some((node) => node.type === NodeType.LANGUAGE);
    const language = (contact.customFields?.language as string | undefined) || matchedFlow.settings.localization?.defaultLanguage;
    if (language && !hasLanguageNode) {
      const translatedNodes = await this.getTranslationWithLazySync(matchedFlow.id!, language);
      if (translatedNodes) {
        flowToExecute = matchedFlow.clone();
        flowToExecute.nodes = translatedNodes as unknown as FlowEntity['nodes'];
      }
    } else if (language && hasLanguageNode) {
      logger.info(
        { flowId: matchedFlow.id, language },
        'SessionInboundHandler: skipping preloaded translation for new session because flow contains a language node'
      );
    }

    try {
      const result = await this.enginePlugin.startFlow(
        { orgId, flowId: matchedFlow.id!, waId, waBusinessNumber },
        flowToExecute,
        contact,
        async (lang: string) => {
          return this.getTranslationWithLazySync(matchedFlow.id!, lang);
        }
      );

      const saved = await this.sessionRepo.create(result.session);
      const sessionId = saved.id!;

      await this.sessionRepo.update(sessionId, {
        status: result.session.status,
        currentNodeId: result.session.currentNodeId,
        variables: result.session.variables,
        history: result.session.history,
        waitingFor: result.session.waitingFor,
        isCurrent: result.session.isCurrent,
      });

      logger.info({ sessionId, flowId: matchedFlow.id }, 'SessionInboundHandler: new session started');
      return { outboundMessages: result.outboundMessages, sessionId };
    } catch (err) {
      logger.error({ err, flowId: matchedFlow.id, waId }, 'SessionInboundHandler: failed to start matched flow');
      return {
        outboundMessages: [{
          type: NodeType.SEND_TEXT,
          payload: { message: 'Sorry, I could not start that journey right now. Please try again shortly.' },
        }],
      };
    }
  }

  private resolveLanguageVariableKey(flow: FlowEntity): string {
    const languageNode = flow.nodes.find((node) => node.type === NodeType.LANGUAGE);
    const configured = languageNode?.data?.['variable'];
    return typeof configured === 'string' && configured.trim().length > 0
      ? configured.trim()
      : 'selected_language';
  }

  private async getTranslationWithLazySync(flowId: string, language: string): Promise<FlowEntity['nodes'] | null> {
    const normalized = (language || '').trim();
    console.log('STEP 3: Service processing', {
      flowId,
      language,
      normalizedLanguage: normalized,
      operation: 'getTranslationWithLazySync',
    });
    if (!normalized) return null;

    const refreshKey = `${SessionInboundHandler.TRANSLATION_REFRESH_VERSION}:${flowId}:${normalized}`;
    const hasFallback = hasProviderFallbackLanguage(normalized);
    SessionInboundHandler.pruneRefreshCache();
    const shouldAttemptRefresh = !SessionInboundHandler.hasFreshRefreshKey(refreshKey);

    const existing = await this.flowRepo.getTranslation(flowId, normalized);
    if (existing?.translatedData && !shouldAttemptRefresh) {
      console.log('STEP 3: Service processing', {
        flowId,
        normalizedLanguage: normalized,
        status: 'cache_hit',
      });
      return existing.translatedData as FlowEntity['nodes'];
    }

    if (existing?.translatedData && shouldAttemptRefresh) {
      logger.info(
        { flowId, language: normalized, hasFallback },
        'SessionInboundHandler: refreshing cached translation once for current translation refresh version'
      );
    }

    try {
      await syncFlowTranslations(this.flowRepo, flowId, [normalized]);
      const synced = await this.flowRepo.getTranslation(flowId, normalized);
      if (synced?.translatedData) {
        SessionInboundHandler.markRefreshKey(refreshKey);
        console.log('STEP 3: Service processing', {
          flowId,
          normalizedLanguage: normalized,
          status: 'synced_from_provider',
        });
        return synced.translatedData as FlowEntity['nodes'];
      }
    } catch (err) {
      logger.warn({ err, flowId, language: normalized }, 'SessionInboundHandler: lazy translation sync failed');

      if (existing?.translatedData) {
        logger.warn(
          { flowId, language: normalized },
          'SessionInboundHandler: translation refresh failed; using existing cached translation'
        );
        return existing.translatedData as FlowEntity['nodes'];
      }
    }

    return null;
  }

  private static hasFreshRefreshKey(key: string): boolean {
    const ts = this.refreshedTranslationKeys.get(key);
    if (!ts) return false;
    if (Date.now() - ts > this.TRANSLATION_REFRESH_TTL_MS) {
      this.refreshedTranslationKeys.delete(key);
      return false;
    }
    return true;
  }

  private static markRefreshKey(key: string): void {
    this.refreshedTranslationKeys.set(key, Date.now());
    if (this.refreshedTranslationKeys.size <= this.MAX_REFRESH_CACHE_KEYS) {
      return;
    }

    // Evict oldest key first to keep memory usage bounded.
    const oldest = this.refreshedTranslationKeys.keys().next().value;
    if (oldest) {
      this.refreshedTranslationKeys.delete(oldest);
    }
  }

  private static pruneRefreshCache(): void {
    const now = Date.now();
    for (const [key, ts] of this.refreshedTranslationKeys) {
      if (now - ts > this.TRANSLATION_REFRESH_TTL_MS) {
        this.refreshedTranslationKeys.delete(key);
      }
    }
  }
}

async function acquireLock(redis: RedisLockClient, key: string, value: string, ttl: number): Promise<boolean> {
  const result = await redis.set(key, value, 'EX', ttl, 'NX');
  return result === 'OK';
}

async function releaseLock(redis: RedisLockClient, key: string, value: string): Promise<void> {
  const current = await redis.get(key);
  if (current === value) await redis.del(key);
}
