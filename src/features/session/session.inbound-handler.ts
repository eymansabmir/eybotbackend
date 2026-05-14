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
import { syncFlowTranslations } from '../../plugins/i18n/syncTranslations';
import { simplifyTriggerText } from './trigger-normalization';
import { IRenudgeService } from '../renudge/renudge.service';

type RedisLockClient = {
  set(key: string, value: string, ex: 'EX', ttl: number, nx: 'NX'): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
};

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
    private readonly credentialRepo: ICredentialRepository,
    private readonly renudgeService: IRenudgeService,
  ) {}

  async process(job: InboundJob): Promise<OutboundJob[]> {
    const { orgId, credentialId, message } = job;
    console.log("STEP 3: SessionInboundHandler started processing job", { orgId, waId: message.waId, text: message.text });
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
      console.log("STEP 4: DB query finished - Active session check", { exists: !!activeSession, sessionId: activeSession?.id });
      const outboundMessages: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let sessionId: string | undefined;

      if (activeSession) {
        // Strict continuity: do not switch to another flow while current session is active.
        logger.info({ sessionId: activeSession.id, waId }, 'SessionInboundHandler: resuming active session');

        const flow = await this.flowRepo.findByIdOrFail(activeSession.flowId);
        const languageVariableKey = this.resolveLanguageVariableKey(flow);
        const currentNodeRaw = flow.nodes.find((node) => node.id === activeSession.currentNodeId);
        const isAtLanguageNode = currentNodeRaw?.type === NodeType.LANGUAGE;

        let flowToExecute = flow;
        const language = (activeSession.variables?.[languageVariableKey] as string | undefined)
          || flow.settings.localization?.defaultLanguage;
        if (language && !isAtLanguageNode) {
          const translatedNodes = await this.getTranslationWithLazySync(flow.id!, language);
          if (translatedNodes) {
            flowToExecute = flow.clone();
            // MERGE: Keep technical data from original nodes (skipIfAlreadySelected, etc.)
            flowToExecute.nodes = flow.nodes.map(orig => {
              const trans = (translatedNodes as any[]).find(t => t.id === orig.id);
              return trans ? { ...orig, data: { ...orig.data, ...this.safeTranslationData(orig, trans) } } : orig;
            }) as any;
          }
        }

        const invalidInputMessage = flow.settings.invalidInputMessage || 'Invalid input. Please try again using the options provided.';

        let userInput: string = text || '';

        // Check if this is a Renudge "Continue" action
        const renudgeConfig = flow.renudgeConfig;
        const continueBtnId = (renudgeConfig?.buttons as any)?.find((b: any) => b.id === 'continue' || b.title?.toLowerCase() === 'continue')?.id || 'continue';
        const isContinueAction = message.interactiveOptionId === continueBtnId || (message.type === 'text' && text?.toLowerCase() === 'continue');

        if (isContinueAction) {
          logger.info({ sessionId: activeSession.id }, 'SessionInboundHandler: User clicked Continue nudge, resending previous node');
          const result = await this.enginePlugin.resumeFlow(
            { sessionId: activeSession.id!, userInput: undefined }, // Passing undefined triggers re-execution of current node
            flow,
            contact,
            activeSession,
            async (lang: string) => {
              return this.getTranslationWithLazySync(flow.id!, lang);
            }
          );

          await this.sessionRepo.update(activeSession.id!, {
            status: result.session.status,
            currentNodeId: result.session.currentNodeId,
            variables: result.session.variables,
            history: result.session.history,
            waitingFor: result.session.waitingFor,
            isCurrent: result.session.isCurrent,
            renudgeAttempts: 0,
          });

          return result.outboundMessages.map(m => ({
            waId, waBusinessNumber, orgId, sessionId: activeSession.id,
            messageType: m.type,
            payload: m.payload,
          }));
        }

        // Reset renudge tracking on user interaction
        activeSession.renudgeAttempts = 0;
        activeSession.lastRenudgeAt = undefined;

        // General type validation before processing
        const expectedType = activeSession.waitingFor?.type;
        const actualType = message.type;

        console.log(`[SessionInboundHandler] Processing engagement for session ${activeSession.id}. Expected type: ${expectedType}, User Input: '${userInput}', isContinueAction: ${isContinueAction}`);

        if (expectedType === 'choice') {
          const options = activeSession.waitingFor?.options || [];
          const isButtonOrList = actualType === 'button' || actualType === 'interactive';
          
          if (message.interactiveOptionId) {
            userInput = message.interactiveOptionId || '';
          } else if (actualType === 'text') {
            // Normalize for comparison
            const inputLower = simplifyTriggerText(text || '');
            const matchedOption = options.find(o => 
              simplifyTriggerText(o.label || '') === inputLower || 
              o.id === (text || '')
            );

            if (matchedOption) {
              userInput = matchedOption.id;
            } else if (!activeSession.waitingFor?.defaultBranchKey) {
              // Not a valid choice and no default branch -> Invalid Input
              return [{
                waId, waBusinessNumber, orgId, sessionId: activeSession.id,
                messageType: NodeType.SEND_TEXT,
                payload: { message: invalidInputMessage },
              }];
            }
          } else if (!isButtonOrList) {
            // Non-textual, non-button input (image, voice, etc.) is always invalid for choice nodes
            return [{
              waId, waBusinessNumber, orgId, sessionId: activeSession.id,
              messageType: NodeType.SEND_TEXT,
              payload: { message: invalidInputMessage },
            }];
          }
        } else if (expectedType === 'location') {
          if (message.location) {
            userInput = JSON.stringify(message.location);
          } else {
            return [{
              waId, waBusinessNumber, orgId, sessionId: activeSession.id,
              messageType: NodeType.SEND_TEXT,
              payload: { message: invalidInputMessage },
            }];
          }
        } else if (expectedType === 'file') {
          const hasMediaInput = Boolean(message.mediaId || message.mediaUrl);
          const textFallback = (text || '').trim();

          if (!hasMediaInput) {
            if (textFallback.length > 0) {
              userInput = textFallback;
            } else {
              return [{
                waId, waBusinessNumber, orgId, sessionId: activeSession.id,
                messageType: NodeType.SEND_TEXT,
                payload: { message: invalidInputMessage },
              }];
            }
          }

          if (hasMediaInput) {
            const uploadUrl = await this.processMediaUpload(message, waId, activeSession.id!);
            if (!uploadUrl) {
              return [{
                waId, waBusinessNumber, orgId, sessionId: activeSession.id,
                messageType: NodeType.SEND_TEXT,
              payload: { message: flow.settings.invalidInputMessage || 'I could not process that file. Please try again.' },
            }];
            }
            userInput = uploadUrl;
          }
        } else if (expectedType === 'text') {
          const isTextualMessage = actualType === 'text' || actualType === 'button' || actualType === 'interactive';
          const hasCaption = actualType !== 'text' && text && text !== actualType;

          if (!isTextualMessage && !hasCaption) {
            return [{
              waId, waBusinessNumber, orgId, sessionId: activeSession.id,
              messageType: NodeType.SEND_TEXT,
              payload: { message: invalidInputMessage },
            }];
          }
        } else if (activeSession.waitingFor?.type === 'media_conditional') {
          const currentNode = flowToExecute.nodes.find((n) => n.id === activeSession.currentNodeId);
          const config = currentNode?.data?.['config'] as Array<{ type: string; subTypes: string[] }> | undefined;
          
          // Node-level invalidMessage takes priority, then flow-level, then default.
          const nodeInvalidMessage = (currentNode?.data?.['invalidMessage'] as string);
          const currentInvalidMessage = nodeInvalidMessage || invalidInputMessage;
          
          let retries = (activeSession.variables['_media_retries'] as number) || 0;
          const maxRetries = (currentNode?.data?.['maxRetries'] as number) || 3;
          const maxRetriesMessage = (currentNode?.data?.['maxRetriesMessage'] as string) || 'Too many invalid attempts. Please start the bot again.';

          const handleInvalidAttempt = async (msg: string) => {
            retries += 1;
            if (retries >= maxRetries) {
              await this.sessionRepo.updateStatus(activeSession.id!, 'error');
              return [{
                waId, waBusinessNumber, messageType: NodeType.SEND_TEXT, payload: { message: maxRetriesMessage }, orgId, sessionId: activeSession.id,
              }];
            } else {
              activeSession.setVariable('_media_retries', retries);
              await this.sessionRepo.update(activeSession.id!, { variables: activeSession.variables });
              return [{
                waId, waBusinessNumber, messageType: NodeType.SEND_TEXT, payload: { message: msg }, orgId, sessionId: activeSession.id,
              }];
            }
          };

          const matchedConfig = config?.find((c) => c.type === message.type);

          if (!matchedConfig) {
            logger.info({ waId, sessionId: activeSession.id, type: message.type, retries }, 'SessionInboundHandler: media_conditional rejected unexpected type');
            return handleInvalidAttempt(currentInvalidMessage);
          }

          // Subtype validation for media
          if (['image', 'video', 'audio', 'document'].includes(message.type)) {
            const allowedSubTypes = matchedConfig.subTypes || [];
            if (allowedSubTypes.length > 0) {
              const ext = message.mediaFilename?.split('.').pop()?.toLowerCase() || '';
              const mime = message.mediaMimeType?.toLowerCase() || '';
              const isAllowed = allowedSubTypes.some((s) => {
                const normalizedS = s.toLowerCase().trim().replace('.', '');
                return (
                  normalizedS === ext || 
                  mime.includes(normalizedS) ||
                  (normalizedS === 'jpg' && mime.includes('jpeg')) ||
                  (normalizedS === 'jpeg' && mime.includes('jpg'))
                );
              });

              if (!isAllowed) {
                logger.info({ waId, sessionId: activeSession.id, ext, mime, retries }, 'SessionInboundHandler: media_conditional rejected unsupported subtype');
                return handleInvalidAttempt(currentInvalidMessage);
              }
            }

            const uploadUrl = await this.processMediaUpload(message, waId, activeSession.id!);
            if (!uploadUrl) {
              return handleInvalidAttempt(flow.settings.invalidInputMessage || 'I could not process that file. Please try again.');
            }
            userInput = JSON.stringify({ type: message.type, value: uploadUrl });
          } else {
            // text or location
            userInput = JSON.stringify({ type: message.type, value: text });
          }
          
          // Clear retry counter on success
          if (activeSession.variables['_media_retries'] !== undefined) {
            delete activeSession.variables['_media_retries'];
            await this.sessionRepo.update(activeSession.id!, { variables: activeSession.variables });
          }
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
            flowId: result.session.flowId,
            flowVersion: result.session.flowVersion,
            status: result.session.status,
            currentNodeId: result.session.currentNodeId,
            variables: result.session.variables,
            history: result.session.history,
            waitingFor: result.session.waitingFor,
            returnMark: result.session.returnMark,
            flowStack: result.session.flowStack,
            isCurrent: result.session.isCurrent,
            renudgeAttempts: 0, // Explicitly reset on new step
            lastRenudgeAt: undefined,
          });

          console.log(`[SessionInboundHandler] Session status after execution: ${result.session.status}`);
          if (result.session.status === 'waiting') {
            console.log(`[SessionInboundHandler] Triggering scheduleFirstNudge for session ${result.session.id}`);
            await this.renudgeService.scheduleFirstNudge(result.session.id!, flow);
          }

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

          const flowFallbackMessage = flow.settings.fallbackMessage || 'Sorry, something went wrong in the current journey. Please send your trigger keyword again to restart.';
          
          outboundMessages.push({
            type: NodeType.SEND_TEXT,
            payload: { message: flowFallbackMessage },
          });
          sessionId = activeSession.id;
        }
      } else {
        // Strict zombie check: prevent interactions with old messages from starting new flows.
        if (message.contextMessageId) {
          logger.info({ waId, contextMessageId: message.contextMessageId }, 'SessionInboundHandler: blocking interaction with old message');
          
          // Fetch last session to identify which flow's fallback to use
          const lastSession = await this.sessionRepo.findLastSession(waBusinessNumber, waId);
          let finishedJourneyMessage = 'You already finished this flow. To start the flow again, please type the trigger keyword.';
          
          if (lastSession) {
            try {
              const flow = await this.flowRepo.findById(lastSession.flowId);
              if (flow?.settings?.finishedJourneyMessage) {
                finishedJourneyMessage = flow.settings.finishedJourneyMessage;
              }
            } catch (err) {
              logger.warn({ err, flowId: lastSession.flowId }, 'SessionInboundHandler: failed to fetch flow for finished journey message');
            }
          }

          return [{
            waId,
            waBusinessNumber,
            messageType: NodeType.SEND_TEXT,
            payload: { message: finishedJourneyMessage },
            orgId,
          }];
        }

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
        // MERGE: Keep technical data from original nodes (skipIfAlreadySelected, etc.)
        flowToExecute.nodes = matchedFlow.nodes.map(orig => {
          const trans = (translatedNodes as any[]).find(t => t.id === orig.id);
          return trans ? { ...orig, data: { ...orig.data, ...this.safeTranslationData(orig, trans) } } : orig;
        }) as any;
      }
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
        flowId: result.session.flowId,
        flowVersion: result.session.flowVersion,
        status: result.session.status,
        currentNodeId: result.session.currentNodeId,
        variables: result.session.variables,
        history: result.session.history,
        waitingFor: result.session.waitingFor,
        returnMark: result.session.returnMark,
        flowStack: result.session.flowStack,
        isCurrent: result.session.isCurrent,
      });

      // Trigger renudge if session is waiting
      if (result.session.status === 'waiting') {
        await this.renudgeService.scheduleFirstNudge(sessionId, matchedFlow);
      }

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
    const configured = languageNode?.data?.['variableName'] || languageNode?.data?.['variable'];
    return typeof configured === 'string' && configured.trim().length > 0
      ? configured.trim()
      : 'selected_language';
  }

  private async getTranslationWithLazySync(flowId: string, language: string): Promise<FlowEntity['nodes'] | null> {
    const normalized = (language || '').trim();
    if (!normalized) return null;

    const existing = await this.flowRepo.getTranslation(flowId, normalized);
    if (existing?.translatedData) {
      return existing.translatedData as FlowEntity['nodes'];
    }

    try {
      await syncFlowTranslations(this.flowRepo, flowId, [normalized]);
      const synced = await this.flowRepo.getTranslation(flowId, normalized);
      return (synced?.translatedData as FlowEntity['nodes']) || null;
    } catch (err) {
      logger.warn({ err, flowId, language: normalized }, 'SessionInboundHandler: fallback translation sync failed');
      return null;
    }
  }

  /**
   * Strips protected technical fields from translation data for language nodes.
   * Translation records may contain stale snapshots of settings like
   * skipIfAlreadySelected that would silently override the master flow's
   * current values.
   */
  private safeTranslationData(originalNode: any, translatedNode: any): Record<string, unknown> {
    const LANGUAGE_PROTECTED_KEYS = new Set([
      'skipIfAlreadySelected',
      'variableName',
      'variable',
      'variableScope',
      'localizationEnabled',
      'languages',
      'defaultLanguage',
      'timeoutSeconds',
    ]);

    const MEDIA_CONDITIONAL_PROTECTED_KEYS = new Set([
      'maxRetries',
      'timeoutSeconds',
      'variable',
      'variableScope',
      'config',
    ]);

    const transData: Record<string, unknown> = { ...(translatedNode.data || {}) };
    
    if (originalNode.type === 'language') {
      for (const key of LANGUAGE_PROTECTED_KEYS) {
        delete transData[key];
      }
    } else if (originalNode.type === 'media_conditional') {
      for (const key of MEDIA_CONDITIONAL_PROTECTED_KEYS) {
        delete transData[key];
      }
    }
    
    return transData;
  }

  private async processMediaUpload(message: any, waId: string, sessionId: string): Promise<string | null> {
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

      logger.info({ waId, sessionId, url: upload.url }, 'SessionInboundHandler: media uploaded successfully');
      return upload.url;
    } catch (err) {
      logger.error({ err, waId, mediaId: message.mediaId, mediaUrl: message.mediaUrl }, 'SessionInboundHandler: failed to process inbound media');
      return null;
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
