import { z } from 'zod';

const jsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([jsonPrimitive, z.array(jsonValue), z.record(jsonValue)]));

export const ConditionLeafSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['equals', 'not_equals', 'in', 'not_in', '<', '>', '<=', '>=', 'contains']),
  value: jsonValue,
});

export type ConditionLeafInput = z.infer<typeof ConditionLeafSchema>;

export type ConditionNodeInput =
  | ConditionLeafInput
  | {
    operator: 'AND' | 'OR';
    children: ConditionNodeInput[];
  };

export const ConditionNodeSchema: z.ZodType<ConditionNodeInput> = z.lazy(() =>
  z.union([
    ConditionLeafSchema,
    z.object({
      operator: z.enum(['AND', 'OR']),
      children: z.array(ConditionNodeSchema).min(1),
    }),
  ]),
);

export const ProviderActionSchema = z.object({
  type: z.literal('VOICE_PROVIDER'),
  voiceProvider: z.string().min(1),
  telephonyProvider: z.string().min(1),
  voiceCredentialId: z.string().uuid(),
  telephonyCredentialId: z.string().uuid(),
  channel: z.enum(['telephony', 'whatsapp']),
  agentId: z.string().min(1),
  mode: z.enum(['single', 'batch']).optional(),
  runtimeConfig: z.record(z.unknown()).default({}),
});

export const IngestEntitiesSchema = z.object({
  tenantId: z.string().min(1),
  entityType: z.string().min(1),
  records: z.array(z.record(z.unknown())).min(1),
});

export const IngestFileSchema = z.object({
  tenantId: z.string().min(1),
  entityType: z.string().min(1),
  filePath: z.string().min(1),
});

export const VoiceIngestStatusSchema = z.object({
  jobId: z.string().min(1),
});

export const ListAttributesSchema = z.object({
  tenantId: z.string().min(1),
  entityType: z.string().min(1),
});

export const ExecuteRoutingSchema = z.object({
  tenantId: z.string().min(1),
  routingConfigId: z.string().min(1),
  attributes: z.record(z.unknown()),
  entityType: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  executeProvider: z.boolean().optional(),
});

export const UpsertRoutingRuleSchema = z.object({
  id: z.string().uuid().optional(),
  routingConfigId: z.string().uuid(),
  priority: z.number().int().min(1),
  conditions: ConditionNodeSchema,
  action: ProviderActionSchema,
  isActive: z.boolean().optional(),
});

export const DeleteRoutingRuleSchema = z.object({
  id: z.string().uuid(),
});

export const CreateRoutingConfigSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
});

export const QueryByRuleSchema = z.object({
  tenantId: z.string().min(1),
  entityType: z.string().min(1),
  conditions: ConditionNodeSchema,
  limit: z.number().int().positive().max(5000).optional(),
});

export const ListRoutingConfigsSchema = z.object({
  tenantId: z.string().min(1),
});

export const GetRoutingConfigSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
});

export const ToggleRuleActiveSchema = z.object({
  ruleId: z.string().uuid(),
  tenantId: z.string().min(1),
  entityType: z.string().min(1), // Required to find recipients for the campaign
  isActive: z.boolean(),
  triggerCampaign: z.boolean().optional(),
});
