import { IWorkerPlugin, EXCHANGES } from '../../plugins/worker/worker.interface';
import { IDatabasePlugin } from '../../plugins/database/database.interface';
import { FlowEntity } from '../flow/flow.entity';
import { logger } from '../../utils/logger';

export interface IRenudgeService {
    scheduleFirstNudge(sessionId: string, flow: FlowEntity): Promise<void>;
    scheduleNextNudge(sessionId: string, currentAttempt: number, flow: FlowEntity): Promise<void>;
    logNudge(sessionId: string, flowId: string, waId: string, attempt: number): Promise<void>;
}

export class RenudgeService implements IRenudgeService {
    constructor(
        private readonly workerPlugin: IWorkerPlugin,
        private readonly dbPlugin: IDatabasePlugin
    ) {
        logger.info('RenudgeService: initialized');
    }

    async scheduleFirstNudge(sessionId: string, flow: FlowEntity): Promise<void> {
        try {
            logger.info({ sessionId, flowId: flow.id }, 'RenudgeService: scheduleFirstNudge called');
            const config = flow.renudgeConfig;
            if (!config) {
                logger.info({ sessionId, flowId: flow.id }, 'RenudgeService: no renudgeConfig found for this flow');
                return;
            }
            if (!config.enabled) {
                logger.info({ sessionId, flowId: flow.id }, 'RenudgeService: renudge is disabled for this flow');
                return;
            }

            const delayMs = config.durationMinutes * 60 * 1000;
            
            await this.workerPlugin.publish(EXCHANGES.RE_NUDGE_RETRY, {
                sessionId,
                attempt: 0
            }, '', { expiration: String(delayMs) });

            logger.info({ sessionId, flowId: flow.id, delayMs }, 'RenudgeService: first nudge scheduled');
        } catch (err) {
            // Robustness: Never allow renudge scheduling failure to crash the main process
            logger.error({ err, sessionId, flowId: flow.id }, 'RenudgeService: failed to schedule first nudge');
        }
    }

    async scheduleNextNudge(sessionId: string, currentAttempt: number, flow: FlowEntity): Promise<void> {
        try {
            const config = flow.renudgeConfig;
            if (!config || !config.enabled) return;

            const nextAttempt = currentAttempt + 1;
            if (nextAttempt >= config.maxAttempts) return;

            const delayMs = config.durationMinutes * 60 * 1000;

            await this.workerPlugin.publish(EXCHANGES.RE_NUDGE_RETRY, {
                sessionId,
                attempt: nextAttempt
            }, '', { expiration: String(delayMs) });

            logger.info({ sessionId, flowId: flow.id, nextAttempt, delayMs }, 'RenudgeService: next nudge scheduled');
        } catch (err) {
            logger.error({ err, sessionId, flowId: flow.id }, 'RenudgeService: failed to schedule next nudge');
        }
    }

    async logNudge(sessionId: string, flowId: string, waId: string, attempt: number): Promise<void> {
        try {
            await this.dbPlugin.prisma.renudgeLog.create({
                data: {
                    flowId,
                    waId,
                    sessionId,
                    attempt
                }
            });
            logger.debug({ sessionId, flowId, waId, attempt }, 'RenudgeService: nudge logged');
        } catch (err) {
            logger.error({ err, sessionId, flowId, waId }, 'RenudgeService: failed to log nudge');
        }
    }
}
