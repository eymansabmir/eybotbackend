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

    const campaign = await this.campaignRepo.create(campaignEntity);
    if (!campaign.id) throw new Error('Failed to create campaign');

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
       throw new Error('Incomplete campaign or version data');
    }

    await this.workerPlugin.publish(EXCHANGES.CAMPAIGN_IMPORT, importJob);

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
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) throw new Error('Campaign not found');

    // If file changed, create new version
    if (data.filePath) {
      const nextVersionNumber = await this.campaignRepo.getLatestVersionNumber(id) + 1;
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
    }

    // Update campaign fields
    // (In a real app, we'd handle status transitions, cancellations of old versions, etc.)
    return campaign;
  }
}
