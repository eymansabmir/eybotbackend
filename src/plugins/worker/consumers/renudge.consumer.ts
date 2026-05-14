import { IPluginRegistry } from '../../plugin.interface';
import { RenudgeJob } from '../jobs';
import { FLOW_REPOSITORY, SESSION_REPOSITORY, RENUDGE_SERVICE } from '../../../features/repositories.interface';
import { IFlowRepository } from '../../../features/flow/flow.repository';
import { ISessionRepository } from '../../../features/session/session.repository';
import { WHATSAPP_PLUGIN, IWhatsAppPlugin } from '../../whatsapp/whatsapp.interface';
import { NodeType } from '../../../schemas/node-types.enum';
import { logger } from '../../../utils/logger';
import { IRenudgeService } from '../../../features/renudge/renudge.service';

export async function handleRenudgeJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as RenudgeJob;
  const { sessionId, attempt } = job;

  try {
    const sessionRepo = registry.get<ISessionRepository>(SESSION_REPOSITORY);
    const flowRepo = registry.get<IFlowRepository>(FLOW_REPOSITORY);
    const whatsappPlugin = registry.get<IWhatsAppPlugin>(WHATSAPP_PLUGIN);
    const renudgeService = registry.get<IRenudgeService>(RENUDGE_SERVICE);

    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      logger.info({ sessionId }, 'RenudgeConsumer: session not found');
      return;
    }
    
    logger.info({ sessionId, status: session.status, isCurrent: session.isCurrent }, 'RenudgeConsumer: processing job');
    
    if (!session.isCurrent || session.status !== 'waiting') {
      logger.info({ sessionId }, 'RenudgeConsumer: session no longer valid for renudge');
      return;
    }

    // Check if user has interacted since the last nudge was scheduled or sent
    // We check renudgeAttempts to see if it matches the job attempt
    if (session.renudgeAttempts !== attempt) {
        logger.info({ sessionId, sessionAttempt: session.renudgeAttempts, jobAttempt: attempt }, 'RenudgeConsumer: attempt mismatch, ignoring');
        return;
    }

    const flow = await flowRepo.findById(session.flowId);
    if (!flow) {
      logger.error({ sessionId, flowId: session.flowId }, 'RenudgeConsumer: flow not found');
      return;
    }

    const renudgeConfig = flow.renudgeConfig;
    if (!renudgeConfig || !renudgeConfig.enabled) {
      logger.info({ sessionId }, 'RenudgeConsumer: renudge disabled for this flow');
      return;
    }

    const { maxAttempts, message, buttons } = renudgeConfig;

    if (attempt >= maxAttempts) {
      logger.info({ sessionId, attempt }, 'RenudgeConsumer: max attempts reached');
      return;
    }

    // Send the nudge
    const outboundMessage = {
      type: NodeType.SEND_BUTTONS,
      payload: {
        body: message || 'Are you still there? Would you like to continue?',
        buttons: (buttons || [
          { id: 'continue', title: 'Continue' },
          { id: 'stop', title: 'Stop' }
        ]).map((b: any, idx: number) => ({
            id: b.id || `btn_${idx}`,
            title: b.title || b.text || 'Button'
        })),
      }
    };

    logger.info({ sessionId, waId: session.waId, attempt }, 'RenudgeConsumer: sending nudge');
    await whatsappPlugin.sender.sendMessages(session.waId, [outboundMessage as any], sessionId);

    const nextAttempt = attempt + 1;
    await sessionRepo.update(sessionId, {
      renudgeAttempts: nextAttempt,
      lastRenudgeAt: new Date(),
    });

    // Use decoupled service for logging and scheduling
    await renudgeService.logNudge(sessionId, session.flowId, session.waId, nextAttempt);
    await renudgeService.scheduleNextNudge(sessionId, attempt, flow);


  } catch (err) {
    logger.error({ sessionId, err }, 'RenudgeConsumer: failed to process renudge');
    throw err;
  }
}
