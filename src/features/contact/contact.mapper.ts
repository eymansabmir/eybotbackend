import { Contact as PrismaContact } from '@prisma/client';
import { ContactEntity } from './contact.entity';

export class ContactMapper {
    public static toEntity(prismaContact: PrismaContact): ContactEntity {
        return new ContactEntity({
            id: prismaContact.id,
            orgId: prismaContact.orgId,
            waId: prismaContact.waId,
            name: prismaContact.name,
            tags: prismaContact.tags,
            customFields: (prismaContact.customFields as any) ?? undefined,
            optIn: prismaContact.optIn,
            createdAt: prismaContact.createdAt,
            updatedAt: prismaContact.updatedAt,
        });
    }

    public static toPrisma(entity: ContactEntity): any {
        const json = entity.toJSON();
        const { id, ...data } = json;

        return {
            ...(id ? { id } : {}),
            orgId: data.orgId,
            waId: data.waId,
            name: data.name,
            tags: data.tags,
            customFields: data.customFields ?? {},
            optIn: data.optIn,
        };
    }
}
