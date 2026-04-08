import { IPluginRegistry } from '../../plugin.interface';
import { RecipientJob, OutboundJob } from '../jobs';
import { WORKER_PLUGIN, EXCHANGES, IWorkerPlugin } from '../worker.interface';
import { ENGINE_PLUGIN, IEnginePlugin, ContactInfo } from '../../engine';
import { CAMPAIGN_REPOSITORY, CAMPAIGN_RECIPIENT_REPOSITORY, FLOW_REPOSITORY, SESSION_REPOSITORY } from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';
import { IFlowRepository } from '../../../features/flow/flow.repository';
import { ISessionRepository } from '../../../features/session/session.repository';
import { RecipientStatus } from '@prisma/client';
import { normalizeWaId } from '../../../utils/whatsapp';

export async function handleExecutionJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as RecipientJob;
  logger.info({ campaignId: job.campaignId, recipientId: job.recipientId, waId: job.waId }, 'ExecutionWorker: processing recipient');

  try {
    const campaignRepo = registry.get<ICampaignRepository>(CAMPAIGN_REPOSITORY);
    const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
    const flowRepo = registry.get<IFlowRepository>(FLOW_REPOSITORY);
    const sessionRepo = registry.get<ISessionRepository>(SESSION_REPOSITORY);
    const enginePlugin = registry.get<IEnginePlugin>(ENGINE_PLUGIN);
    const workerPlugin = registry.get<IWorkerPlugin>(WORKER_PLUGIN);

    // Look up campaign to get flowId and business number
    const campaign = await campaignRepo.findByIdWithFlow(job.campaignId);
    if (!campaign) throw new Error(`Campaign ${job.campaignId} not found`);

    const flowId: string = campaign.flowId;
    const waBusinessNumber: string = campaign.waBusinessNumber ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
    const waId = normalizeWaId(job.waId);

    const flow = await flowRepo.findByIdOrFail(flowId);

    const contact: ContactInfo = { waId, name: waId, customFields: {} };

    await sessionRepo.clearCurrentFlags(waBusinessNumber, waId);
    const result = await enginePlugin.startFlow(
      { orgId: job.orgId, flowId, waId, waBusinessNumber, initialVariables: job.variables as Record<string, unknown> },
      flow,
      contact,
    );

    const savedSession = await sessionRepo.create(result.session);
    logger.debug({ sessionId: savedSession.id, recipientId: job.recipientId }, 'ExecutionWorker: session created');

    // Queue outbound messages — tag the first one with recipientId so the outbound
    // consumer can save Meta's message_id back for delivery/read tracking.
    for (const [index, msg] of result.outboundMessages.entries()) {
      const outJob: OutboundJob = {
        waId,
        waBusinessNumber,
        orgId: job.orgId,
        messageType: msg.type,
        payload: msg.payload as Record<string, unknown>,
        ...(savedSession.id !== undefined ? { sessionId: savedSession.id } : {}),
        ...(index === 0 ? { campaignRecipientId: job.recipientId } : {}),
      };
      await workerPlugin.publish(EXCHANGES.OUTBOUND, outJob);
    }

    await recipientRepo.updateStatusWithStats(job.recipientId, job.campaignId, RecipientStatus.completed);
    logger.info({ campaignId: job.campaignId, recipientId: job.recipientId }, 'ExecutionWorker: recipient processed');

  } catch (err) {
    logger.error({ campaignId: job.campaignId, recipientId: job.recipientId, err }, 'ExecutionWorker: recipient failed');
    try {
      const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
      await recipientRepo.updateStatusWithStats(job.recipientId, job.campaignId, RecipientStatus.failed);
    } catch (_err) {
      logger.error({ recipientId: job.recipientId }, 'ExecutionWorker: also failed to update failed status');
    }
    throw err;
  }
}
