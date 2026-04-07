import { z } from 'zod';
import { NodeSchema } from './node.schema';
import { EdgeSchema } from './edge.schema';

export const FlowStatusSchema = z.enum(['draft', 'published', 'archived']);

export type FlowStatus = z.infer<typeof FlowStatusSchema>;

export const TriggerTypeSchema = z.enum(['inbound', 'keyword', 'api']);

export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const TriggerConfigSchema = z.object({
  enabled: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
  comparisons: z.array(z.object({
    operator: z.enum(['CONTAINS', 'EQUALS', 'STARTS_WITH', 'ENDS_WITH']),
    value: z.string(),
  })).optional(),
  logicalOperator: z.enum(['AND', 'OR']).optional().default('OR'),
});

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

export const FlowSettingsSchema = z.object({
  credentialId: z.string().optional(),
  timeoutSeconds: z.number().default(300),
  maxSteps: z.number().default(100),
  maxConsecutiveLogicSteps: z.number().default(10),
  fallbackMessage: z.string().default('Sorry, something went wrong. Please try again later.'),
  localization: z.object({
    isEnabled: z.boolean().default(false),
    languages: z.array(z.string()).max(10, 'Localization supports maximum 10 languages').default([]),
    defaultLanguage: z.string().optional(),
  }).optional(),
  variables: z.array(z.object({
    id: z.string(),
    name: z.string(),
    isSessionVariable: z.boolean().default(true),
  })).optional(),
});

export type FlowSettings = z.infer<typeof FlowSettingsSchema>;

export const FlowSchema = z.object({
  id: z.string().optional(),
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
  isConfigured: z.boolean().default(false),
  publishedAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Flow = z.infer<typeof FlowSchema>;
