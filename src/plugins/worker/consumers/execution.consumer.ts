import { IPluginRegistry } from '../../plugin.interface';
import { WORKER_PLUGIN, EXCHANGES, type IWorkerPlugin } from '../../worker';
import { ENGINE_PLUGIN, type IEnginePlugin, type ContactInfo } from '../../engine';
import { RecipientJob } from '../jobs';
import { RecipientStatus } from '@prisma/client';
import { FlowEntity } from '../../../features/flow/flow.entity';
import {
  CAMPAIGN_REPOSITORY,
  CAMPAIGN_RECIPIENT_REPOSITORY,
  FLOW_REPOSITORY,
  SESSION_REPOSITORY
} from '../../../features/repositories.interface';
import { ICampaignRepository } from '../../../features/campaign/campaign.repository';
import { ICampaignRecipientRepository } from '../../../features/campaign/campaign-recipient.repository';
import { IFlowRepository } from '../../../features/flow/flow.repository';
import { ISessionRepository } from '../../../features/session/session.repository';

export async function handleExecutionJob(data: unknown, registry: IPluginRegistry): Promise<void> {
  const job = data as RecipientJob;
  console.log(`[ExecutionWorker] Executing campaign ${job.campaignId} for recipient ${job.waId}`);

  const worker = registry.get<IWorkerPlugin>(WORKER_PLUGIN);
  const engine = registry.get<IEnginePlugin>(ENGINE_PLUGIN);

  const campaignRepo = registry.get<ICampaignRepository>(CAMPAIGN_REPOSITORY);
  const recipientRepo = registry.get<ICampaignRecipientRepository>(CAMPAIGN_RECIPIENT_REPOSITORY);
  const flowRepo = registry.get<IFlowRepository>(FLOW_REPOSITORY);
  const sessionRepo = registry.get<ISessionRepository>(SESSION_REPOSITORY);

  try {
    // 1. Fetch campaign to get flowId
    const campaign = await campaignRepo.findById(job.campaignId);
    if (!campaign) throw new Error(`Campaign not found: ${job.campaignId}`);

    const flow = await flowRepo.findById(campaign.flowId);
    if (!flow) throw new Error(`Flow not found: ${campaign.flowId}`);

    // 2. Build transient contact info from job (no DB persistence)
    const contact: ContactInfo = {
      waId: job.waId,
      name: job.waId,
      customFields: {},
    };

    // 3. Map to entity
    const flowEntity = new FlowEntity(flow as any);

    // 4. Start flow for the recipient
    const waBusinessNumber = 'SYSTEM'; // TODO: Campaign should carry this field
    const result = await engine.startFlow(
      {
        orgId: job.orgId,
        flowId: campaign.flowId,
        waId: job.waId,
        waBusinessNumber,
        initialVariables: job.variables,
      },
      flowEntity,
      contact,
    );

    // 5. Persist session
    const savedSession = await sessionRepo.create(result.session);

    // 6. Publish outbound messages to wa.outbound
    for (const msg of result.outboundMessages) {
      await worker.publish(EXCHANGES.OUTBOUND, {
        waId: job.waId,
        waBusinessNumber,
        messageType: msg.type,
        payload: msg.payload,
        orgId: job.orgId,
        sessionId: savedSession.id,
      });
    }

    // 7. Mark recipient as completed and update stats
    await recipientRepo.updateStatusWithStats(job.recipientId, job.campaignId, RecipientStatus.completed);

    console.log(`[ExecutionWorker] Execution complete for ${job.waId}`);

  } catch (error) {
    console.error(`[ExecutionWorker] Failed for recipient ${job.waId}:`, error);
    try {
      await recipientRepo.updateStatusWithStats(job.recipientId, job.campaignId, RecipientStatus.failed);
    } catch (e) {
      console.error('[ExecutionWorker] Error marking failed:', e);
    }
  }
}
