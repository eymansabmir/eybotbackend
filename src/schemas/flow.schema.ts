import { z } from 'zod';
import { NodeSchema } from './node.schema';
import { EdgeSchema } from './edge.schema';

export const FlowStatusSchema = z.enum(['draft', 'published', 'archived']);

export type FlowStatus = z.infer<typeof FlowStatusSchema>;

export const TriggerTypeSchema = z.enum(['inbound', 'keyword', 'api']);

export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const TriggerConfigSchema = z.object({
  keywords: z.array(z.string()).optional(),
});

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

export const FlowSettingsSchema = z.object({
  timeoutSeconds: z.number().default(300),
  maxSteps: z.number().default(100),
  maxConsecutiveLogicSteps: z.number().default(10),
  fallbackMessage: z.string().default('Sorry, something went wrong. Please try again later.'),
});

export type FlowSettings = z.infer<typeof FlowSettingsSchema>;

export const FlowSchema = z.object({
  _id: z.string().optional(),
  orgId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: FlowStatusSchema,
  version: z.number().default(1),
  triggerType: TriggerTypeSchema,
  triggerConfig: TriggerConfigSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  settings: FlowSettingsSchema,
  publishedAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Flow = z.infer<typeof FlowSchema>;
