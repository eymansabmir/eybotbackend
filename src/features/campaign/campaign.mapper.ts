import { Campaign as PrismaCampaign, CampaignStatus } from '@prisma/client';
import { CampaignEntity } from './campaign.entity';

export class CampaignMapper {
  public static toEntity(prismaCampaign: PrismaCampaign): CampaignEntity {
    return new CampaignEntity({
      id: prismaCampaign.id,
      orgId: prismaCampaign.orgId,
      name: prismaCampaign.name,
      flowId: prismaCampaign.flowId,
      scheduleTime: prismaCampaign.scheduleTime,
      status: prismaCampaign.status as CampaignStatus,
      activeVersionId: prismaCampaign.activeVersionId,
      createdAt: prismaCampaign.createdAt,
      updatedAt: prismaCampaign.updatedAt,
    });
  }

  public static toPrisma(entity: CampaignEntity): any {
    return {
      id: entity.id,
      orgId: entity.orgId,
      name: entity.name,
      flowId: entity.flowId,
      scheduleTime: entity.scheduleTime,
      status: entity.status,
      activeVersionId: entity.activeVersionId ?? null, // Ensure null for optional fields if undefined
    };
  }
}
