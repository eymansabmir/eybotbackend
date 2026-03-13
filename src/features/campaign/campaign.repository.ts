import { PrismaClient, CampaignStatus, CampaignVersionStatus } from '@prisma/client';
import { CampaignEntity } from './campaign.entity';
import { CampaignMapper } from './campaign.mapper';
import { NotFoundError } from '../../utils/errors';

export interface ICampaignRepository {
  create(campaign: CampaignEntity): Promise<CampaignEntity>;
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
    filePath: string;
    versionNumber: number;
  }): Promise<any>;
  updateVersionStatus(id: string, status: CampaignVersionStatus): Promise<any>;
  getLatestVersionNumber(campaignId: string): Promise<number>;
  updateStats(campaignId: string, updates: { 
    sent?: number; 
    failed?: number; 
    pending?: number;
    total?: number;
  }): Promise<void>;
  createStats(campaignId: string, total: number): Promise<void>;
}

export class PrismaCampaignRepository implements ICampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(campaign: CampaignEntity): Promise<CampaignEntity> {
    const data = CampaignMapper.toPrisma(campaign);
    const created = await this.prisma.campaign.create({ data });
    return CampaignMapper.toEntity(created);
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
    filePath: string;
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
    const lastVersion = await this.prisma.campaignVersion.findFirst({
      where: { campaignId },
      orderBy: { versionNumber: 'desc' },
    });
    return lastVersion?.versionNumber || 0;
  }

  async updateStats(campaignId: string, updates: { 
    sent?: number; 
    failed?: number; 
    pending?: number;
    total?: number;
  }): Promise<void> {
    const data: any = {};
    if (updates.sent !== undefined) data.sent = { increment: updates.sent };
    if (updates.failed !== undefined) data.failed = { increment: updates.failed };
    if (updates.pending !== undefined) data.pending = { increment: updates.pending };
    if (updates.total !== undefined) data.total = updates.total;

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
      },
      update: {
        total,
        pending: total,
        sent: 0,
        failed: 0,
      },
    });
  }
}
