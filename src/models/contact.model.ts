import mongoose, { Schema, Document } from 'mongoose';
import { Contact } from '../schemas/contact.schema';

export interface ContactDocument extends Omit<Contact, '_id'>, Document {}

const ContactSchema = new Schema<ContactDocument>({
  orgId: { type: String, required: true, index: true },
  waId: { type: String, required: true },
  name: { type: String, required: true },
  tags: { type: [String], default: [] },
  customFields: { type: Schema.Types.Mixed, default: {} },
  optIn: { type: Boolean, default: true },
}, {
  timestamps: true,
});

ContactSchema.index({ orgId: 1, waId: 1 }, { unique: true });
ContactSchema.index({ tags: 1 });

export const ContactModel = mongoose.model<ContactDocument>('Contact', ContactSchema);
