import { ActivityAction, ActivityEntityType, ActivityLogMetadata } from './activity-log.types';

export interface ActivityLogProperties {
  id?: string;
  orgId: string;
  userId?: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  metadata?: ActivityLogMetadata | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
}

export class ActivityLog {
  public readonly id?: string;
  public readonly orgId: string;
  public readonly userId?: string | null;
  public readonly action: ActivityAction;
  public readonly entityType: ActivityEntityType;
  public readonly entityId: string;
  public readonly metadata?: ActivityLogMetadata | null;
  public readonly ipAddress?: string | null;
  public readonly userAgent?: string | null;
  public readonly createdAt: Date;

  constructor(props: ActivityLogProperties) {
    this.id = props.id;
    this.orgId = props.orgId;
    this.userId = props.userId;
    this.action = props.action;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.metadata = props.metadata;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.createdAt = props.createdAt || new Date();
  }
}
