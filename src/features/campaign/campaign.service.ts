import { ICampaignRepository } from './campaign.repository';
import { IWorkerPlugin, EXCHANGES } from '../../plugins/worker/worker.interface';
import { CampaignEntity } from './campaign.entity';
import { ImportJob, DispatchJob } from '../../plugins/worker/jobs';
import { CampaignStatus } from '@prisma/client';

export class CampaignService {
  constructor(
    private readonly campaignRepo: ICampaignRepository,
    private readonly workerPlugin: IWorkerPlugin,
  ) {}

  async createCampaign(data: {
    orgId: string;
    name: string;
    flowId: string;
    filePath: string;
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
      filePath: data.filePath,
      versionNumber: 1,
    });
    await this.campaignRepo.update(campaign.id, { activeVersionId: version.id });

    // 3. Trigger Import Job
    // autoStart=true tells the import consumer to enqueue CAMPAIGN_START once recipients are loaded.
    // For scheduled campaigns the poller handles dispatch instead.
    const importJob: ImportJob = {
      campaignId: campaign.id,
      campaignVersionId: version.id,
      filePath: data.filePath,
      orgId: data.orgId,
      autoStart: isImmediate,
    };

    await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, importJob);
    logger.info({ campaignId: campaign.id, versionId: version.id, autoStart: isImmediate }, 'Campaign created and import job published');

    return { campaign, version };
  }

  async listCampaigns(orgId: string) {
    return this.campaignRepo.findAll(orgId);
  }

  async getCampaign(id: string) {
    return this.campaignRepo.findById(id);
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
