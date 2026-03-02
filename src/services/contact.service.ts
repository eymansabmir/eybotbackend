import { IContactRepository } from '../repositories/contact.repository';
import { ContactDocument } from '../models/contact.model';
import { Contact } from '../schemas/contact.schema';
import { normalizeWaId } from '../utils/whatsapp';

export interface IContactService {
  createContact(contact: Contact): Promise<ContactDocument>;
  getContactById(id: string): Promise<ContactDocument>;
  getContactByWaId(orgId: string, waId: string): Promise<ContactDocument | null>;
  getOrCreateContactByWaId(orgId: string, waId: string, name?: string): Promise<ContactDocument>;
  getContactsByOrgId(orgId: string): Promise<ContactDocument[]>;
  updateContact(id: string, updates: Partial<Contact>): Promise<ContactDocument>;
  updateContactCustomFields(id: string, customFields: Record<string, any>): Promise<ContactDocument>;
  deleteContact(id: string): Promise<void>;
}

export class ContactService implements IContactService {
  constructor(private readonly contactRepository: IContactRepository) {}

  async createContact(contact: Contact): Promise<ContactDocument> {
    return await this.contactRepository.create(contact);
  }

  async getContactById(id: string): Promise<ContactDocument> {
    return await this.contactRepository.findByIdOrFail(id);
  }

  async getContactByWaId(orgId: string, waId: string): Promise<ContactDocument | null> {
    return await this.contactRepository.findByWaId(orgId, normalizeWaId(waId));
  }

  async getOrCreateContactByWaId(orgId: string, waId: string, name?: string): Promise<ContactDocument> {
    return await this.contactRepository.findOrCreateByWaId(orgId, normalizeWaId(waId), name);
  }

  async getContactsByOrgId(orgId: string): Promise<ContactDocument[]> {
    return await this.contactRepository.findByOrgId(orgId);
  }

  async updateContact(id: string, updates: Partial<Contact>): Promise<ContactDocument> {
    return await this.contactRepository.update(id, updates);
  }

  async updateContactCustomFields(id: string, customFields: Record<string, any>): Promise<ContactDocument> {
    return await this.contactRepository.updateCustomFields(id, customFields);
  }

  async deleteContact(id: string): Promise<void> {
    await this.contactRepository.delete(id);
  }
}
