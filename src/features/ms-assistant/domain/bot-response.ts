import { z } from 'zod';

export const BotButtonSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(20),
});

export const BotListRowSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});

export const BotListSectionSchema = z.object({
  title: z.string().min(1).max(24),
  rows: z.array(BotListRowSchema).min(1).max(10),
});

export const BotMediaSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

export const BotResponseSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('text'),
    text: z.string().min(1),
  }),
  z.object({
    mode: z.literal('buttons'),
    text: z.string().min(1),
    buttons: z.array(BotButtonSchema).min(1).max(3),
  }),
  z.object({
    mode: z.literal('list'),
    text: z.string().min(1),
    buttonTitle: z.string().min(1).max(20).default('Options'),
    sections: z.array(BotListSectionSchema).min(1).max(10),
  }),
  z.object({
    mode: z.literal('image'),
    text: z.string().optional(),
    media: BotMediaSchema,
  }),
  z.object({
    mode: z.literal('document'),
    text: z.string().optional(),
    media: BotMediaSchema,
  }),
]);

export type BotResponse = z.infer<typeof BotResponseSchema>;
export type BotButton = z.infer<typeof BotButtonSchema>;
