import { ICampaignRepository } from './campaign.repository';
import { ICampaignRecipientRepository } from './campaign-recipient.repository';
import { IWorkerPlugin, EXCHANGES } from '../../plugins/worker/worker.interface';
import { CampaignEntity } from './campaign.entity';
import { ImportJob, DispatchJob, TriggerJob, RecipientJob } from '../../plugins/worker/jobs';
import { CampaignStatus } from '@prisma/client';

export class CampaignService {
  constructor(
    private readonly campaignRepo: ICampaignRepository,
    private readonly recipientRepo: ICampaignRecipientRepository,
    private readonly workerPlugin: IWorkerPlugin,
  ) {}

  async processApiTrigger(job: TriggerJob): Promise<void> {
    logger.info({ botId: job.botId, count: job.data.length, campaignName: job.campaignName, mode: job.executionMode }, 'CampaignService: processing API trigger');

    // 1. Resolve or Create the Campaign with Smart Defaults
    const targetStatus = job.executionMode === 'SCHEDULED' ? CampaignStatus.scheduled : CampaignStatus.running;
    const executeAt = job.executeAt ? new Date(job.executeAt) : undefined;

    const { campaignId, versionId } = await this.campaignRepo.findOrCreateSystemCampaign(
      job.orgId, 
      job.botId, 
      job.campaignName, 
      targetStatus,
      executeAt,
      job.isSystem
    );

    // 2. Prepare Batch Insert (Cleaning phone numbers)
    const recipientsToCreate = job.data.map(item => ({
      waId: item.to.replace(/\D/g, ''),
      variables: item.variables,
    }));

    // 3. Persist to DB (Bulk)
    const createdRecipients = await this.recipientRepo.batchCreate(versionId, recipientsToCreate);
    
    // 4. Update Stats (Increment pending/total)
    await this.campaignRepo.updateStats(campaignId, { 
      total: createdRecipients.length, 
      pending: createdRecipients.length 
    });

    // 5. Check if we should dispatch immediately
    // If the campaign is RUNNING (either already was, or we just set it so via executionMode: NOW)
    const campaign = await this.campaignRepo.findById(campaignId);
    if (campaign?.status === CampaignStatus.running) {
      // Dispatch only the recipients from THIS specific batch (versionId)
      for (const recipient of createdRecipients) {
        const execJob: RecipientJob = {
          campaignId,
          campaignVersionId: versionId,
          recipientId: recipient.id,
          waId: recipient.waId,
          variables: recipient.variables as Record<string, any>,
          orgId: job.orgId,
        };
        await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_DISPATCH, execJob);
      }
      logger.info({ campaignId, batchVersion: versionId, count: createdRecipients.length }, 'CampaignService: API batch dispatched');
    } else {
      logger.info({ campaignId, batchVersion: versionId, count: createdRecipients.length, status: campaign?.status }, 'CampaignService: API batch added to PENDING campaign');
    }
  }

  async createCampaign(data: {
    orgId: string;
    name: string;
    flowId: string;
    filePath?: string;
    dataSourceId?: string;
    tableName?: string;
    scheduleTime?: Date;
  }) {
    const isImmediate = !data.scheduleTime;
    const initialStatus = isImmediate ? CampaignStatus.running : CampaignStatus.scheduled;

    // 1. Create Campaign with the right status from the start
    const campaignEntity = CampaignEntity.create({
      orgId: data.orgId,
      name: data.name,
      flowId: data.flowId,
      scheduleTime: data.scheduleTime,
      status: initialStatus,
      dataSourceId: data.dataSourceId,
      tableName: data.tableName
    });

    logger.info({ orgId: data.orgId, name: data.name, flowId: data.flowId, isImmediate }, 'Creating new campaign');
    const campaign = await this.campaignRepo.create(campaignEntity);
    if (!campaign.id) {
      logger.error({ orgId: data.orgId, name: data.name }, 'Failed to create campaign record');
      throw new Error('Failed to create campaign');
    }

    // 2. Create Initial Version and set it as active immediately
    const version = await this.campaignRepo.createVersion({
      campaignId: campaign.id,
      filePath: data.filePath || null,
      versionNumber: 1,
    });
    await this.campaignRepo.update(campaign.id, { activeVersionId: version.id });

    // 3. Trigger Import Job
    if (data.filePath) {
      const importJob: ImportJob = {
        campaignId: campaign.id,
        campaignVersionId: version.id,
        filePath: data.filePath,
        orgId: data.orgId,
        autoStart: isImmediate,
      };
      await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, importJob);
    } else if (data.dataSourceId) {
       // [NEW] Trigger Database Ingestion Job
       const dbIngestionJob = {
         campaignId: campaign.id,
         campaignVersionId: version.id,
         dataSourceId: data.dataSourceId,
         tableName: data.tableName,
         orgId: data.orgId,
         autoStart: isImmediate,
       };
       // We reuse the IMPORT exchange but the consumer will detect the dataSourceId
       await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, dbIngestionJob);
    }

    logger.info({ campaignId: campaign.id, versionId: version.id, autoStart: isImmediate }, 'Campaign created and ingestion job published');

    return { campaign, version };
  }

  async listCampaigns(orgId: string) {
    return this.campaignRepo.findAll(orgId);
  }

  async getCampaign(id: string) {
    return this.campaignRepo.findById(id);
  }

  async getCampaignStats(id: string) {
    // Verify campaign exists
    await this.campaignRepo.findByIdOrFail(id);
    const stats = await this.campaignRepo.findStatsById(id);

    return {
      analytics: {
        total: stats?.total ?? 0,
        sent: stats?.sent ?? 0,
        completed: stats?.completed ?? 0,
        failed: stats?.failed ?? 0,
        pending: stats?.pending ?? 0,
        initiated: 0,
        delivered: 0,
        opened: 0,
        started: 0,
        queued: 0,
        nps: null,
      },
    };
  }

  async deleteCampaign(id: string, orgId: string) {
    logger.info({ campaignId: id }, 'Deleting campaign');
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.orgId !== orgId) {
      throw new Error('Unauthorized');
    }
    await this.campaignRepo.delete(id);
  }

  async cancelCampaign(id: string, orgId: string) {
    logger.info({ campaignId: id }, 'Cancelling campaign');
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) {
      throw new Error('Campaign not found');
    }
    if (campaign.orgId !== orgId) {
      throw new Error('Unauthorized');
    }
    if (campaign.status === CampaignStatus.completed || campaign.status === CampaignStatus.cancelled) {
      throw new Error('Campaign cannot be cancelled');
    }
    return this.campaignRepo.updateStatus(id, CampaignStatus.cancelled);
  }

  async updateCampaign(id: string, data: {
    name?: string;
    flowId?: string;
    filePath?: string;
    scheduleTime?: Date;
  }) {
    logger.info({ campaignId: id }, 'Updating campaign');
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) {
      logger.warn({ campaignId: id }, 'Attempted to update non-existent campaign');
      throw new Error('Campaign not found');
    }

    // If file changed, create new version
    if (data.filePath) {
      const nextVersionNumber = await this.campaignRepo.getLatestVersionNumber(id) + 1;
      logger.info({ campaignId: id, nextVersionNumber }, 'Creating new campaign version for file update');
      const version = await this.campaignRepo.createVersion({
        campaignId: id,
        filePath: data.filePath,
        versionNumber: nextVersionNumber,
      });

      const importJob: ImportJob = {
        campaignId: id,
        campaignVersionId: version.id,
        filePath: data.filePath,
        orgId: campaign.orgId,
        autoStart: false,
      };

      await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, importJob);
      logger.info({ campaignId: id, versionId: version.id }, 'New campaign version published for import');
    }

    return campaign;
  }

  async startCampaign(id: string, orgId: string) {
    logger.info({ campaignId: id }, 'Starting campaign');
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.orgId !== orgId) {
      throw new Error('Unauthorized');
    }

    if (campaign.status === CampaignStatus.running || campaign.status === CampaignStatus.completed) {
      throw new Error('Campaign cannot be started');
    }

    const version = await this.campaignRepo.getLatestVersion(id);
    if (!version) {
      throw new Error('No campaign version found');
    }

    let delayMs = 0;
    let newStatus: CampaignStatus = CampaignStatus.running;

    if (campaign.scheduleTime) {
      const diff = campaign.scheduleTime.getTime() - Date.now();
      if (diff > 0) {
        delayMs = diff;
        newStatus = CampaignStatus.scheduled;
      }
    }

    await this.campaignRepo.updateStatus(id, newStatus);
    
    // update activeVersionId
    await this.campaignRepo.update(id, { activeVersionId: version.id });

    const job: DispatchJob = {
      campaignId: id,
      campaignVersionId: version.id,
      orgId,
    };

    if (delayMs > 0) {
      logger.info({ campaignId: id, delayMs }, 'Campaign scheduled for future execution (via db polling)');
    } else {
      logger.info({ campaignId: id }, 'Publishing immediate campaign start');
      await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_START, job);
    }

    return { status: newStatus };
  }

  startScheduler(intervalMs = 60000) {
    logger.info('Starting Campaign DB Polling Scheduler...');
    setInterval(async () => {
      try {
        await this.pollScheduledCampaigns();
      } catch (err) {
        logger.error({ err }, 'Error during campaign poll');
      }
    }, intervalMs);
  }

  private async pollScheduledCampaigns() {
    const dueCampaigns = await this.campaignRepo.findDueScheduledCampaigns();
    
    for (const campaign of dueCampaigns) {
      if (!campaign.id) continue;
      
      try {
        // Attempt to swap status to running (safe against concurrent pollers)
        const locked = await this.campaignRepo.updateStatusIfScheduled(campaign.id, CampaignStatus.running);
        if (!locked) continue; // Someone else handled it or status changed

        const version = await this.campaignRepo.getLatestVersion(campaign.id);
        if (!version) continue;

        await this.campaignRepo.update(campaign.id, { activeVersionId: version.id });

        const job: DispatchJob = {
          campaignId: campaign.id,
          campaignVersionId: version.id,
          orgId: campaign.orgId,
        };

        logger.info({ campaignId: campaign.id }, 'Scheduler dispatching due campaign');
        await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_START, job);
      } catch (err) {
        logger.error({ err, campaignId: campaign.id }, 'Failed to dispatch due scheduled campaign');
      }
    }
  }
}
