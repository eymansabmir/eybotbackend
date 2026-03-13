import type { IInboundHandler } from '../../plugins/worker/handlers.interface';
import type { InboundJob, OutboundJob } from '../../plugins/worker/jobs';
import type { IFlowRepository } from '../flow/flow.repository';
import type { IContactRepository } from '../contact/contact.repository';
import type { ISessionRepository } from './session.repository';
import { ContactEntity } from '../contact/contact.entity';
import type { IEnginePlugin } from '../../plugins/engine';
import type { IRedisPlugin } from '../../plugins/redis';
import { ValidationError } from '../../utils/errors';

const LOCK_PREFIX = 'wa:lock:';
const LOCK_TTL = 10; // seconds

export class SessionInboundHandler implements IInboundHandler {
  constructor(
    private readonly flowRepo: IFlowRepository,
    private readonly contactRepo: IContactRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly enginePlugin: IEnginePlugin,
    private readonly redisPlugin: IRedisPlugin,
  ) {}

  async process(job: InboundJob): Promise<OutboundJob[]> {
    const { orgId, message } = job;
    const { waId, waBusinessNumber, text } = message;

    const redis = this.redisPlugin.client;
    const lockKey = `${LOCK_PREFIX}${waBusinessNumber}:${waId}`;
    const lockValue = `inbound-${message.messageId}`;

    const locked = await acquireLock(redis, lockKey, lockValue, LOCK_TTL);
    if (!locked) {
      throw new Error(`[SessionInboundHandler] Could not acquire lock for ${waId}`);
    }

    try {
      // Ensure contact exists
      let contact = await this.contactRepo.findByWaId(orgId, waId);
      if (!contact) {
        contact = await this.contactRepo.create(new ContactEntity({
          orgId, waId,
          name: message.contactName ?? waId,
          tags: [], customFields: {}, optIn: true,
        }));
      }

      const activeSession = await this.sessionRepo.findCurrentByWhatsApp(waBusinessNumber, waId);
      const outboundMessages: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let sessionId: string;

      if (activeSession) {
        // Resume
        let userInput = text;
        if (activeSession.waitingFor?.type === 'choice' && message.interactiveOptionId) {
          userInput = message.interactiveOptionId;
        }

        const flow = await this.flowRepo.findByIdOrFail(activeSession.flowId);
        const { result, contactMutations } = (this.enginePlugin as any).orchestrator.resumeFlow(
          flow, contact, activeSession, userInput,
        );

        await this.sessionRepo.update(result.session.id!, {
          status: result.session.status,
          currentNodeId: result.session.currentNodeId,
          variables: result.session.variables,
          history: result.session.history,
          waitingFor: result.session.waitingFor,
          isCurrent: result.session.isCurrent,
        });

        if (Object.keys(contactMutations).length > 0) {
          await this.contactRepo.update(contact.id!, {
            customFields: { ...contact.customFields, ...contactMutations },
          });
        }

        outboundMessages.push(...result.outboundMessages);
        sessionId = result.session.id!;
      } else {
        // Match flow by keyword
        const tokens = (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        let flow = null;
        for (const token of tokens) {
          flow = await this.flowRepo.findPublishedByOrgAndKeyword(orgId, token);
          if (flow) break;
        }

        if (!flow) {
          throw new ValidationError('No published flow matched the incoming message');
        }

        await this.sessionRepo.clearCurrentFlags(waBusinessNumber, waId);
        const { result, contactMutations } = (this.enginePlugin as any).orchestrator.startFlow(
          flow, contact, {},
          flow.id!, contact.id!, waId, waBusinessNumber,
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

        if (Object.keys(contactMutations).length > 0) {
          await this.contactRepo.update(contact.id!, {
            customFields: { ...contact.customFields, ...contactMutations },
          });
        }

        outboundMessages.push(...result.outboundMessages);
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
