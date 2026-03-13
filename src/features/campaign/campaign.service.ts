import { ICampaignRepository } from './campaign.repository';
import { IWorkerPlugin, EXCHANGES } from '../../plugins/worker/worker.interface';
import { CampaignEntity } from './campaign.entity';
import { ImportJob } from '../../plugins/worker/jobs';

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
    // 1. Create Campaign
    const campaignEntity = CampaignEntity.create({
      orgId: data.orgId,
      name: data.name,
      flowId: data.flowId,
      scheduleTime: data.scheduleTime,
    });

    logger.info({ orgId: data.orgId, name: data.name, flowId: data.flowId }, 'Creating new campaign');
    const campaign = await this.campaignRepo.create(campaignEntity);
    if (!campaign.id) {
      logger.error({ orgId: data.orgId, name: data.name }, 'Failed to create campaign record');
      throw new Error('Failed to create campaign');
    }

    // 2. Create Initial Version
    const version = await this.campaignRepo.createVersion({
      campaignId: campaign.id,
      filePath: data.filePath,
      versionNumber: 1,
    });

    // 3. Trigger Import Job
    const importJob: ImportJob = {
      campaignId: campaign.id,
      campaignVersionId: version.id,
      filePath: data.filePath,
      orgId: data.orgId,
    };

    if (!importJob.campaignId || !importJob.campaignVersionId) {
       logger.error({ campaignId: campaign.id }, 'Incomplete campaign or version data for import job');
       throw new Error('Incomplete campaign or version data');
    }

    await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, importJob);
    logger.info({ campaignId: campaign.id, versionId: version.id }, 'Campaign created and import job published');

    return { campaign, version };
  }

  async getCampaign(id: string) {
    return this.campaignRepo.findById(id);
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
      };

      await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, importJob);
      logger.info({ campaignId: id, versionId: version.id }, 'New campaign version published for import');
    }

    return campaign;
  }
}
