import { ContactEntity, ContactProperties } from './contact.entity';
import { IContactRepository } from './contact.repository';
import { normalizeWaId } from '../../utils/whatsapp';

export interface IContactService {
  createContact(data: Partial<ContactProperties>): Promise<ContactEntity>;
  getContactById(id: string): Promise<ContactEntity>;
  getContactByWaId(orgId: string, waId: string): Promise<ContactEntity | null>;
  getOrCreateContactByWaId(orgId: string, waId: string, name?: string): Promise<ContactEntity>;
  getContactsByOrgId(orgId: string): Promise<ContactEntity[]>;
  updateContact(id: string, updates: Partial<ContactProperties>): Promise<ContactEntity>;
  deleteContact(id: string): Promise<void>;
}

export class ContactService implements IContactService {
  constructor(private readonly contactRepo: IContactRepository) {}

  async createContact(data: Partial<ContactProperties>): Promise<ContactEntity> {
    const entity = new ContactEntity({
      orgId: data.orgId!,
      waId: normalizeWaId(data.waId!),
      name: data.name!,
      tags: data.tags ?? [],
      customFields: data.customFields ?? {},
      optIn: data.optIn ?? true,
    });
    return this.contactRepo.create(entity);
  }

  async getContactById(id: string): Promise<ContactEntity> {
    return this.contactRepo.findByIdOrFail(id);
  }

  async getContactByWaId(orgId: string, waId: string): Promise<ContactEntity | null> {
    return this.contactRepo.findByWaId(orgId, normalizeWaId(waId));
  }

  async getOrCreateContactByWaId(orgId: string, waId: string, name?: string): Promise<ContactEntity> {
    return this.contactRepo.findOrCreateByWaId(orgId, normalizeWaId(waId), name);
  }

  async getContactsByOrgId(orgId: string): Promise<ContactEntity[]> {
    return this.contactRepo.findByOrgId(orgId);
  }

  async updateContact(id: string, updates: Partial<ContactProperties>): Promise<ContactEntity> {
    return this.contactRepo.update(id, updates);
  }

  async deleteContact(id: string): Promise<void> {
    await this.contactRepo.delete(id);
  }
}
