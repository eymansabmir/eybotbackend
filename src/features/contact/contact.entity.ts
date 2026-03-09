export interface ContactProperties {
    id?: string | undefined;
    orgId: string;
    waId: string;
    name: string;
    tags?: string[] | undefined;
    customFields?: Record<string, any> | undefined;
    optIn?: boolean | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
}

export class ContactEntity {
    public id?: string | undefined;
    public readonly orgId: string;
    public readonly waId: string;
    public name: string;
    public tags: string[];
    public customFields: Record<string, any>;
    public optIn: boolean;
    public readonly createdAt?: Date | undefined;
    public readonly updatedAt?: Date | undefined;

    constructor(props: ContactProperties) {
        this.id = props.id;
        this.orgId = props.orgId;
        this.waId = props.waId;
        this.name = props.name;
        this.tags = props.tags || [];
        this.customFields = props.customFields || {};
        this.optIn = props.optIn ?? true;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }

    public updateName(name: string): void {
        this.name = name;
    }

    public addTag(tag: string): void {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
        }
    }

    public removeTag(tag: string): void {
        this.tags = this.tags.filter(t => t !== tag);
    }

    public setCustomField(key: string, value: any): void {
        this.customFields[key] = value;
    }

    public setOptIn(optIn: boolean): void {
        this.optIn = optIn;
    }

    public toJSON() {
        return {
            id: this.id,
            orgId: this.orgId,
            waId: this.waId,
            name: this.name,
            tags: this.tags,
            customFields: this.customFields,
            optIn: this.optIn,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
