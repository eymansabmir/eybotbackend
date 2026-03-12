import { PrismaClient } from '@prisma/client';
import { ContactEntity, ContactProperties } from './contact.entity';
import { ContactMapper } from './contact.mapper';
import { NotFoundError } from '../../utils/errors';

export interface IContactRepository {
    create(contact: ContactEntity): Promise<ContactEntity>;
    findById(id: string): Promise<ContactEntity | null>;
    findByIdOrFail(id: string): Promise<ContactEntity>;
    findByWaId(orgId: string, waId: string): Promise<ContactEntity | null>;
    findOrCreateByWaId(orgId: string, waId: string, name?: string): Promise<ContactEntity>;
    findByOrgId(orgId: string): Promise<ContactEntity[]>;
    update(id: string, updates: Partial<ContactProperties>): Promise<ContactEntity>;
    delete(id: string): Promise<void>;
}

export class PrismaContactRepository implements IContactRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async create(contact: ContactEntity): Promise<ContactEntity> {
        const data = ContactMapper.toPrisma(contact);
        const created = await this.prisma.contact.create({ data });
        return ContactMapper.toEntity(created);
    }

    async findById(id: string): Promise<ContactEntity | null> {
        const contact = await this.prisma.contact.findUnique({ where: { id } });
        if (!contact) return null;
        return ContactMapper.toEntity(contact);
    }

    async findByIdOrFail(id: string): Promise<ContactEntity> {
        const contact = await this.findById(id);
        if (!contact) {
            throw new NotFoundError('Contact', id);
        }
        return contact;
    }

    async findByWaId(orgId: string, waId: string): Promise<ContactEntity | null> {
        const contact = await this.prisma.contact.findUnique({
            where: {
                orgId_waId: { orgId, waId },
            },
        });
        if (!contact) return null;
        return ContactMapper.toEntity(contact);
    }

    async findOrCreateByWaId(orgId: string, waId: string, name?: string): Promise<ContactEntity> {
        const contact = await this.prisma.contact.upsert({
            where: { orgId_waId: { orgId, waId } },
            update: {},
            create: {
                orgId,
                waId,
                name: name || waId,
                tags: [],
                customFields: {},
                optIn: true,
            },
        });
        return ContactMapper.toEntity(contact);
    }

    async findByOrgId(orgId: string): Promise<ContactEntity[]> {
        const contacts = await this.prisma.contact.findMany({
            where: { orgId },
            orderBy: { updatedAt: 'desc' },
        });
        return contacts.map(ContactMapper.toEntity);
    }

    async update(id: string, updates: Partial<ContactProperties>): Promise<ContactEntity> {
        try {
            const data: any = { ...updates };
            delete data.id;
            delete data.createdAt;
            delete data.updatedAt;

            const updated = await this.prisma.contact.update({
                where: { id },
                data,
            });
            return ContactMapper.toEntity(updated);
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new NotFoundError('Contact', id);
            }
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await this.prisma.contact.delete({ where: { id } });
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new NotFoundError('Contact', id);
            }
            throw error;
        }
    }
}

