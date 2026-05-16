import { PrismaClient, CampaignStatus, CampaignVersionStatus, CampaignStats } from '@prisma/client';
import { CampaignEntity } from './campaign.entity';
import { CampaignMapper } from './campaign.mapper';
import { NotFoundError } from '../../utils/errors';

export interface ICampaignRepository {
  create(campaign: CampaignEntity): Promise<CampaignEntity>;
  findAll(orgId: string): Promise<CampaignEntity[]>;
  findById(id: string): Promise<CampaignEntity | null>;
  findByIdOrFail(id: string): Promise<CampaignEntity>;
  findByIdWithFlow(id: string): Promise<any>; // Includes flow
  update(id: string, data: Partial<{
    name: string;
    flowId: string;
    status: CampaignStatus;
    activeVersionId: string;
    scheduleTime: Date | null;
  }>): Promise<CampaignEntity>;
  updateStatus(id: string, status: CampaignStatus): Promise<CampaignEntity>;
  createVersion(data: {
    campaignId: string;
    filePath?: string | null;
    versionNumber: number;
  }): Promise<any>;
  updateVersionStatus(id: string, status: CampaignVersionStatus): Promise<any>;
  getLatestVersionNumber(campaignId: string): Promise<number>;
  getLatestVersion(campaignId: string): Promise<any>;
  findDueScheduledCampaigns(): Promise<CampaignEntity[]>;
  updateStatusIfScheduled(id: string, status: CampaignStatus): Promise<boolean>;
  delete(id: string): Promise<void>;
  findStatsById(campaignId: string): Promise<CampaignStats | null>;
  updateStats(campaignId: string, updates: {
    sent?: number;
    failed?: number;
    pending?: number;
    completed?: number;
    total?: number;
  }): Promise<void>;
  createStats(campaignId: string, total: number): Promise<void>;
  findOrCreateSystemCampaign(orgId: string, flowId: string, campaignName: string, status?: CampaignStatus, scheduleTime?: Date, isSystem?: boolean): Promise<{ campaignId: string, versionId: string }>;
}

export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(campaign: CampaignEntity): Promise<CampaignEntity> {
    const data = CampaignMapper.toPrisma(campaign);
    const created = await this.prisma.campaign.create({ data });
    return CampaignMapper.toEntity(created);
  }

  async findAll(orgId: string): Promise<CampaignEntity[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { orgId, isSystem: false },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map(CampaignMapper.toEntity);
  }

  async findById(id: string): Promise<CampaignEntity | null> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return null;
    return CampaignMapper.toEntity(campaign);
  }

  async findByIdOrFail(id: string): Promise<CampaignEntity> {
    const campaign = await this.findById(id);
    if (!campaign) {
      throw new NotFoundError('Campaign', id);
    }
    return campaign;
  }

  async findByIdWithFlow(id: string): Promise<any> {
    return this.prisma.campaign.findUnique({
      where: { id },
      include: {
        flow: true,
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    flowId: string;
    status: CampaignStatus;
    activeVersionId: string;
    scheduleTime: Date | null;
    dataSourceId: string | null;
    tableName: string | null;
  }>): Promise<CampaignEntity> {
    const updated = await this.prisma.campaign.update({
      where: { id },
      data,
    });
    return CampaignMapper.toEntity(updated);
  }

  async updateStatus(id: string, status: CampaignStatus): Promise<CampaignEntity> {
    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status },
    });
    return CampaignMapper.toEntity(updated);
  }

  async createVersion(data: {
    campaignId: string;
    filePath?: string | null;
    versionNumber: number;
  }): Promise<any> {
    return this.prisma.campaignVersion.create({
      data: {
        ...data,
        status: CampaignVersionStatus.draft,
      },
    });
  }

  async updateVersionStatus(id: string, status: CampaignVersionStatus): Promise<any> {
    return this.prisma.campaignVersion.update({
      where: { id },
      data: { status },
    });
  }

  async getLatestVersionNumber(campaignId: string): Promise<number> {
    const lastVersion = await this.getLatestVersion(campaignId);
    return lastVersion?.versionNumber || 0;
  }

  async getLatestVersion(campaignId: string): Promise<any> {
    return this.prisma.campaignVersion.findFirst({
      where: { campaignId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async findDueScheduledCampaigns(): Promise<CampaignEntity[]> {
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: CampaignStatus.scheduled,
        scheduleTime: {
          lte: new Date(),
        },
      },
    });
    return campaigns.map(CampaignMapper.toEntity);
  }

  async updateStatusIfScheduled(id: string, status: CampaignStatus): Promise<boolean> {
    const result = await this.prisma.campaign.updateMany({
      where: { 
        id,
        status: CampaignStatus.scheduled,
      },
      data: { status },
    });
    return result.count > 0;
  }

  async delete(id: string): Promise<void> {
    // 1. Delete Recipients linked to versions of this campaign
    await this.prisma.campaignRecipient.deleteMany({
      where: { version: { campaignId: id } }
    });
    
    // 2. Delete Versions
    await this.prisma.campaignVersion.deleteMany({
      where: { campaignId: id }
    });
    
    // 3. Delete Stats
    await this.prisma.campaignStats.deleteMany({
      where: { campaignId: id }
    });
    
    // 4. Finally delete the campaign
    await this.prisma.campaign.delete({ where: { id } });
  }

  async findStatsById(campaignId: string): Promise<CampaignStats | null> {
    return this.prisma.campaignStats.findUnique({ where: { campaignId } });
  }

  async updateStats(campaignId: string, updates: {
    sent?: number;
    failed?: number;
    pending?: number;
    completed?: number;
    total?: number;
  }): Promise<void> {
    const data: any = {};
    if (updates.sent !== undefined) data.sent = { increment: updates.sent };
    if (updates.failed !== undefined) data.failed = { increment: updates.failed };
    if (updates.pending !== undefined) data.pending = { increment: updates.pending };
    if (updates.completed !== undefined) data.completed = { increment: updates.completed };
    if (updates.total !== undefined) data.total = { increment: updates.total };

    await this.prisma.campaignStats.update({
      where: { campaignId },
      data,
    });
  }

  async createStats(campaignId: string, total: number): Promise<void> {
    await this.prisma.campaignStats.upsert({
      where: { campaignId },
      create: {
        campaignId,
        total,
        pending: total,
        sent: 0,
        failed: 0,
        completed: 0,
      },
      update: {
        total,
        pending: total,
        sent: 0,
        failed: 0,
        completed: 0,
      },
    });
  }

  async findOrCreateSystemCampaign(
    orgId: string, 
    flowId: string, 
    campaignName: string, 
    status: CampaignStatus = CampaignStatus.running,
    scheduleTime?: Date,
    isSystem: boolean = false
  ): Promise<{ campaignId: string, versionId: string }> {
    const name = campaignName;
    
    // 1. Find or Create the Campaign (Triple Key: Org + Name + Flow)
    let campaign = await this.prisma.campaign.findFirst({
      where: { orgId, flowId, name, isSystem },
    });
    
    if (!campaign) {
      campaign = await this.prisma.campaign.create({
        data: {
          orgId,
          flowId,
          name,
          status,
          scheduleTime,
          isSystem
        }
      });
      await this.createStats(campaign.id, 0);
    } else {
      // [Product Edge Case] If campaign exists and is NOT yet running, we allow schedule overrides
      if (campaign.status === CampaignStatus.draft || campaign.status === CampaignStatus.scheduled) {
        campaign = await this.prisma.campaign.update({
          where: { id: campaign.id },
          data: { 
            status, 
            scheduleTime: scheduleTime || campaign.scheduleTime,
            isSystem
          }
        });
      }
    }
    
    // 2. Manage Versions (Batches)
    // If the campaign is already RUNNING or COMPLETED, we treat this as a NEW batch (New Version)
    const isReEntrant = campaign.status === CampaignStatus.running || campaign.status === CampaignStatus.completed;
    
    let version;
    if (isReEntrant) {
      const lastVersionNum = await this.getLatestVersionNumber(campaign.id);
      version = await this.prisma.campaignVersion.create({
        data: {
          campaignId: campaign.id,
          versionNumber: lastVersionNum + 1,
          filePath: `api-batch-${Date.now()}`,
          status: CampaignVersionStatus.ready,
        }
      });
    } else {
      // For Draft/Scheduled, we append to the first version
      version = await this.prisma.campaignVersion.findFirst({
        where: { campaignId: campaign.id },
      });
      
      if (!version) {
        version = await this.prisma.campaignVersion.create({
          data: {
            campaignId: campaign.id,
            versionNumber: 1,
            filePath: 'api-trigger',
            status: CampaignVersionStatus.ready,
          }
        });
      }
    }
    
    return { campaignId: campaign.id, versionId: version.id };
  }
}
