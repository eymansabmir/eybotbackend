import { CampaignStatus } from '@prisma/client';

export interface CampaignProperties {
  id: string | null;
  orgId: string;
  name: string;
  flowId: string;
  scheduleTime: Date | null;
  status: CampaignStatus;
  activeVersionId: string | null;
  fieldMapping: any | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export class CampaignEntity {
  public readonly id: string | null;
  public readonly orgId: string;
  public readonly name: string;
  public readonly flowId: string;
  public readonly scheduleTime: Date | null;
  public readonly status: CampaignStatus;
  public readonly activeVersionId: string | null;
  public readonly fieldMapping: any | null;
  public readonly createdAt: Date | null;
  public readonly updatedAt: Date | null;

  constructor(props: CampaignProperties) {
    this.id = props.id ?? null;
    this.orgId = props.orgId;
    this.name = props.name;
    this.flowId = props.flowId;
    this.scheduleTime = props.scheduleTime ?? null;
    this.status = props.status;
    this.activeVersionId = props.activeVersionId ?? null;
    this.fieldMapping = props.fieldMapping ?? null;
    this.createdAt = props.createdAt ?? null;
    this.updatedAt = props.updatedAt ?? null;
  }

  public static create(props: {
    orgId: string;
    name: string;
    flowId: string;
    scheduleTime?: Date | null | undefined;
    status?: CampaignStatus;
  }): CampaignEntity {
    return new CampaignEntity({
      id: null,
      orgId: props.orgId,
      name: props.name,
      flowId: props.flowId,
      scheduleTime: props.scheduleTime ?? null,
      status: props.status ?? CampaignStatus.draft,
      activeVersionId: null,
      fieldMapping: null,
      createdAt: null,
      updatedAt: null,
    });
  }

  public toJSON() {
    return {
      id: this.id,
      orgId: this.orgId,
      name: this.name,
      flowId: this.flowId,
      scheduleTime: this.scheduleTime,
      status: this.status,
      activeVersionId: this.activeVersionId,
      fieldMapping: this.fieldMapping,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
