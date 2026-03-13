import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { IContactService } from './contact.service';
import { ContactSchema } from '../../schemas/contact.schema';
import { pruneUndefined } from '../../utils/object';

const pickFirst = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const ContactListQuerySchema = z.object({ orgId: z.preprocess(pickFirst, z.string()) });
const ContactUpdateSchema = z.object({
  name: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.any()).optional(),
  optIn: z.boolean().optional(),
});

export class ContactController {
  constructor(private readonly contactService: IContactService) {}

  createContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = ContactSchema.parse(req.body);
      const contact = await this.contactService.createContact(data);
      res.status(201).json(contact);
    } catch (err) { next(err); }
  };

  getContactById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const contact = await this.contactService.getContactById(req.params['id'] as string);
      res.json(contact);
    } catch (err) { next(err); }
  };

  getContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { orgId } = ContactListQuerySchema.parse(req.query);
      const contacts = await this.contactService.getContactsByOrgId(orgId);
      res.json(contacts);
    } catch (err) { next(err); }
  };

  updateContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params['id'] as string;
      const updates = pruneUndefined(ContactUpdateSchema.parse(req.body));
      const contact = await this.contactService.updateContact(id, updates as any);
      res.json(contact);
    } catch (err) { next(err); }
  };

  deleteContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.contactService.deleteContact(req.params['id'] as string);
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
