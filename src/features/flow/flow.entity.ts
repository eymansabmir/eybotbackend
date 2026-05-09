import { FlowStatus, TriggerType, TriggerConfig, FlowSettings } from '../../schemas/flow.schema';
import { Node } from '../../schemas/node.schema';
import { Edge } from '../../schemas/edge.schema';

export interface FlowProperties {
    id?: string | undefined;
    orgId: string;
    name: string;
    description?: string | undefined;
    status: FlowStatus;
    version?: number | undefined;
    triggerType: TriggerType;
    triggerConfig: TriggerConfig;
    nodes: Node[];
    edges: Edge[];
    settings: FlowSettings;
    isConfigured?: boolean | undefined;
    publishedAt?: Date | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    executions?: number;
    successfulExecutions?: number;
    renudgeConfig?: RenudgeConfigProperties;
}

export interface RenudgeConfigProperties {
    id?: string;
    flowId: string;
    enabled: boolean;
    durationMinutes: number;
    maxAttempts: number;
    message: string;
    buttons?: any;
    createdAt?: Date;
    updatedAt?: Date;
}

export class FlowEntity {
    public id?: string | undefined;
    public readonly orgId: string;
    public name: string;
    public description?: string | undefined;
    public status: FlowStatus;
    public version: number;
    public triggerType: TriggerType;
    public triggerConfig: TriggerConfig;
    public nodes: Node[];
    public edges: Edge[];
    public settings: FlowSettings;
    public isConfigured?: boolean | undefined;
    public publishedAt?: Date | undefined;
    public readonly createdAt?: Date | undefined;
    public readonly updatedAt?: Date | undefined;
    public executions: number;
    public successfulExecutions: number;
    public renudgeConfig?: RenudgeConfigProperties;

    constructor(props: FlowProperties) {
        this.id = props.id;
        this.orgId = props.orgId;
        this.name = props.name;
        this.description = props.description;
        this.status = props.status;
        this.version = props.version ?? 1;
        this.triggerType = props.triggerType;
        this.triggerConfig = props.triggerConfig;
        this.nodes = props.nodes;
        this.edges = props.edges;
        this.settings = props.settings;
        this.isConfigured = props.isConfigured;
        this.publishedAt = props.publishedAt;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
        this.executions = props.executions ?? 0;
        this.successfulExecutions = props.successfulExecutions ?? 0;
        this.renudgeConfig = props.renudgeConfig;
    }

    public publish(): void {
        this.status = 'published';
        this.publishedAt = new Date();
        this.version += 1;
    }

    public archive(): void {
        this.status = 'archived';
    }

    public updateContent(nodes: Node[], edges: Edge[]): void {
        this.nodes = nodes;
        this.edges = edges;
        this.status = 'draft'; // Back to draft on content change
    }

    public toJSON() {
        return {
            id: this.id,
            orgId: this.orgId,
            name: this.name,
            description: this.description,
            status: this.status,
            version: this.version,
            triggerType: this.triggerType,
            triggerConfig: this.triggerConfig,
            nodes: this.nodes,
            edges: this.edges,
            settings: this.settings,
            isConfigured: this.isConfigured,
            publishedAt: this.publishedAt,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            executions: this.executions,
            successfulExecutions: this.successfulExecutions,
            renudgeConfig: this.renudgeConfig,
        };
    }

    public clone(): FlowEntity {
        return new FlowEntity(this.toJSON() as any);
    }
}
