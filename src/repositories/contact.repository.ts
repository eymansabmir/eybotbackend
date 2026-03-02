import { ContactModel, ContactDocument } from '../models/contact.model';
import { Contact } from '../schemas/contact.schema';
import { NotFoundError } from '../utils/errors';

export interface IContactRepository {
  create(contact: Contact): Promise<ContactDocument>;
  findById(id: string): Promise<ContactDocument | null>;
  findByIdOrFail(id: string): Promise<ContactDocument>;
  findByWaId(orgId: string, waId: string): Promise<ContactDocument | null>;
  findOrCreateByWaId(orgId: string, waId: string, name?: string): Promise<ContactDocument>;
  findByOrgId(orgId: string): Promise<ContactDocument[]>;
  update(id: string, updates: Partial<Contact>): Promise<ContactDocument>;
  updateCustomFields(id: string, customFields: Record<string, any>): Promise<ContactDocument>;
  delete(id: string): Promise<void>;
}

export class ContactRepository implements IContactRepository {
  async create(contact: Contact): Promise<ContactDocument> {
    const document = new ContactModel(contact);
    return await document.save();
  }

  async findById(id: string): Promise<ContactDocument | null> {
    return await ContactModel.findById(id).exec();
  }

  async findByIdOrFail(id: string): Promise<ContactDocument> {
    const contact = await this.findById(id);
    if (!contact) {
      throw new NotFoundError('Contact', id);
    }
    return contact;
  }

  async findByWaId(orgId: string, waId: string): Promise<ContactDocument | null> {
    return await ContactModel.findOne({ orgId, waId }).exec();
  }

  async findOrCreateByWaId(orgId: string, waId: string, name?: string): Promise<ContactDocument> {
    const defaults: Contact = {
      orgId,
      waId,
      name: name || waId,
      tags: [],
      customFields: {},
      optIn: true,
    };

    return await ContactModel.findOneAndUpdate(
      { orgId, waId },
      { $setOnInsert: defaults },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).exec();
  }

  async findByOrgId(orgId: string): Promise<ContactDocument[]> {
    return await ContactModel.find({ orgId }).sort({ updatedAt: -1 }).exec();
  }

  async update(id: string, updates: Partial<Contact>): Promise<ContactDocument> {
    const contact = await ContactModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!contact) {
      throw new NotFoundError('Contact', id);
    }

    return contact;
  }

  async updateCustomFields(id: string, customFields: Record<string, any>): Promise<ContactDocument> {
    const contact = await ContactModel.findByIdAndUpdate(
      id,
      { $set: { customFields } },
      { new: true }
    ).exec();

    if (!contact) {
      throw new NotFoundError('Contact', id);
    }

    return contact;
  }

  async delete(id: string): Promise<void> {
    const result = await ContactModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundError('Contact', id);
    }
  }
}
