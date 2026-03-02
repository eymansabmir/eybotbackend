import { z } from 'zod';

export const ContactSchema = z.object({
  _id: z.string().optional(),
  orgId: z.string(),
  waId: z.string(),
  name: z.string(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
  optIn: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Contact = z.infer<typeof ContactSchema>;
