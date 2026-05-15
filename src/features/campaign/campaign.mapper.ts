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
      dataSourceId: (prismaCampaign as any).dataSourceId,
      tableName: (prismaCampaign as any).tableName,
      fieldMapping: prismaCampaign.fieldMapping,
      createdAt: prismaCampaign.createdAt,
      updatedAt: prismaCampaign.updatedAt,
    });
  }

  public static toPrisma(entity: CampaignEntity): any {
    const data: any = {
      orgId: entity.orgId,
      name: entity.name,
      status: entity.status,
      // Use the relation connect form — Prisma rejects the raw scalar flowId
      // on create when a @relation is defined on the same field.
      flow: { connect: { id: entity.flowId } },
      ...(entity.scheduleTime != null && { scheduleTime: entity.scheduleTime }),
      ...(entity.activeVersionId != null && { activeVersionId: entity.activeVersionId }),
      ...(entity.dataSourceId != null && { dataSourceId: entity.dataSourceId }),
      ...(entity.tableName != null && { tableName: entity.tableName }),
      ...(entity.fieldMapping != null && { fieldMapping: entity.fieldMapping }),
    };

    // Only include id for upsert / explicit-id scenarios; omit on new records
    // so Prisma uses @default(uuid()).
    if (entity.id != null) {
      data.id = entity.id;
    }

    return data;
  }
}
