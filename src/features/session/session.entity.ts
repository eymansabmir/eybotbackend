import { NodeType } from '../../schemas/node-types.enum';

export type SessionStatus = 'active' | 'waiting' | 'completed' | 'timed_out' | 'error';

export interface SessionHistoryStep {
    nodeId: string;
    nodeType: NodeType;
    enteredAt: Date;
    exitedAt?: Date;
    branchTaken?: string;
    userInput?: string;
}

export type WaitingFor =
    | { type: 'text'; since: Date; timeoutAt: Date; variableName: string; variableScope: 'session' | 'contact' }
    | { type: 'choice'; since: Date; timeoutAt: Date; options: { id: string; branchKey: string; label?: string }[]; defaultBranchKey?: string; variableName?: string; variableScope?: 'session' | 'contact' }
    | { type: 'file'; since: Date; timeoutAt: Date; variableName: string; variableScope: 'session' | 'contact' }
    | { type: 'location'; since: Date; timeoutAt: Date; variableName: string; variableScope: 'session' | 'contact' }
    | { type: 'media_conditional'; since: Date; timeoutAt: Date; variableName?: string; variableScope?: 'session' | 'contact' };

export interface SessionProperties {
    id?: string | undefined;
    flowId: string;
    flowVersion: number;
    /** @deprecated Contact management removed; kept optional for DB backward compat */
    contactId?: string | undefined;
    waId: string;
    waBusinessNumber: string;
    status: SessionStatus;
    currentNodeId: string;
    variables?: Record<string, any> | undefined;
    history?: SessionHistoryStep[] | undefined;
    waitingFor?: WaitingFor | undefined;
    flowStack?: Array<{ flowId: string; flowVersion: number; returnNodeId: string }> | undefined;
    isCurrent?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}

export class SessionEntity {
    public id?: string | undefined;
    public flowId: string;
    public flowVersion: number;
    /** @deprecated Contact management removed; kept optional for DB backward compat */
    public readonly contactId?: string | undefined;
    public readonly waId: string;
    public readonly waBusinessNumber: string;
    public status: SessionStatus;
    public currentNodeId: string;
    public variables: Record<string, any>;
    public history: SessionHistoryStep[];
    public waitingFor?: WaitingFor | undefined;
    public flowStack: Array<{ flowId: string; flowVersion: number; returnNodeId: string }>;
    public isCurrent: boolean;
    public readonly createdAt?: Date | undefined;
    public readonly updatedAt?: Date | undefined;

    constructor(props: SessionProperties) {
        this.id = props.id;
        this.flowId = props.flowId;
        this.flowVersion = props.flowVersion;
        this.contactId = props.contactId;
        this.waId = props.waId;
        this.waBusinessNumber = props.waBusinessNumber;
        this.status = props.status;
        this.currentNodeId = props.currentNodeId;
        this.variables = props.variables || {};
        this.history = props.history || [];
        this.waitingFor = props.waitingFor;
        this.flowStack = props.flowStack || [];
        this.isCurrent = props.isCurrent ?? true;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }

    public updateStatus(status: SessionStatus): void {
        this.status = status;
    }

    public moveToNode(nodeId: string): void {
        this.currentNodeId = nodeId;
    }

    public setVariable(name: string, value: any): void {
        this.variables[name] = value;
    }

    public addToHistory(step: SessionHistoryStep): void {
        this.history.push(step);
    }

    public setWaitingFor(waiting: WaitingFor): void {
        this.waitingFor = waiting;
        this.status = 'waiting';
    }

    public clearWaitingFor(): void {
        this.waitingFor = undefined;
        this.status = 'active';
    }

    public jumpToFlow(flowId: string, version: number, startNodeId: string): void {
        this.flowId = flowId;
        this.flowVersion = version;
        this.currentNodeId = startNodeId;
    }

    public pushStack(flowId: string, version: number, returnNodeId: string): void {
        this.flowStack.push({ flowId, flowVersion: version, returnNodeId });
    }

    public popStack(): { flowId: string; flowVersion: number; returnNodeId: string } | undefined {
        return this.flowStack.pop();
    }

    public toJSON() {
        return {
            id: this.id,
            flowId: this.flowId,
            flowVersion: this.flowVersion,
            contactId: this.contactId,
            waId: this.waId,
            waBusinessNumber: this.waBusinessNumber,
            status: this.status,
            currentNodeId: this.currentNodeId,
            variables: this.variables,
            history: this.history,
            waitingFor: this.waitingFor,
            flowStack: this.flowStack,
            isCurrent: this.isCurrent,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
