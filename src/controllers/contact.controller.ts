import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { IContactService } from '../services/contact.service';
import { Contact, ContactSchema } from '../schemas/contact.schema';
import { pruneUndefined } from '../utils/object';

const pickFirstQueryValue = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);
const QueryStringSchema = z.preprocess(pickFirstQueryValue, z.string());

const ContactUpdateSchema = z.object({
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
  optIn: z.boolean().optional(),
});

const ContactListQuerySchema = z.object({
  orgId: QueryStringSchema,
});

export class ContactController {
  constructor(private readonly contactService: IContactService) {}

  createContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedData = ContactSchema.parse(req.body);
      const contact = await this.contactService.createContact(validatedData);
      res.status(201).json(contact);
    } catch (error) {
      next(error);
    }
  };

  getContactById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const contact = await this.contactService.getContactById(id);
      res.json(contact);
    } catch (error) {
      next(error);
    }
  };

  getContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId } = ContactListQuerySchema.parse(req.query);
      const contacts = await this.contactService.getContactsByOrgId(orgId);
      res.json(contacts);
    } catch (error) {
      next(error);
    }
  };

  updateContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const parsedUpdates = ContactUpdateSchema.parse(req.body) as Partial<Contact>;
      const updates = pruneUndefined<Contact>(parsedUpdates);
      const contact = await this.contactService.updateContact(id, updates);
      res.json(contact);
    } catch (error) {
      next(error);
    }
  };

  deleteContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      await this.contactService.deleteContact(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
