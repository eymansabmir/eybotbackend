import { z } from 'zod';
import { NodeType } from './node-types.enum';
import { ConditionExpressionSchema } from './condition.schema';
import { VariableAssignmentSchema, InputTypeSchema, ValidationRuleSchema } from './variable.schema';
import { NodeInteractionSchema } from './node-interaction.schema';

const SendTextDataSchema = z.object({
  message: z.string(),
});

const SendMediaDataSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
});

const SendLocationDataSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  name: z.string().optional(),
  address: z.string().optional(),
});

const SendButtonsDataSchema = z.object({
  body: z.string(),
  footer: z.string().optional(),
  buttons: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
    })
  ).max(3),
  timeoutSeconds: z.number().optional(),
  interaction: NodeInteractionSchema.optional(),
});

const SendListDataSchema = z.object({
  body: z.string(),
  footer: z.string().optional(),
  buttonTitle: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      rows: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
        })
      ),
    })
  ),
  timeoutSeconds: z.number().optional(),
  interaction: NodeInteractionSchema.optional(),
});

const SendDocumentDataSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

const SendTemplateDataSchema = z.object({
  templateName: z.string(),
  languageCode: z.string(),
  components: z.array(z.any()).optional(),
});

const AskQuestionDataSchema = z.object({
  message: z.string(),
  variableName: z.string(),
  variableScope: z.enum(['session', 'contact']),
  inputType: InputTypeSchema,
  validation: ValidationRuleSchema.optional(),
  timeoutSeconds: z.number(),
});

const ConditionDataSchema = z.object({
  expression: ConditionExpressionSchema,
});

const SetVariableDataSchema = z.object({
  assignments: z.array(VariableAssignmentSchema),
});

const RandomSplitDataSchema = z.object({
  branches: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      percentage: z.number(),
    })
  ),
});

const JumpToFlowDataSchema = z.object({
  targetFlowId: z.string(),
});

const HumanHandoffDataSchema = z.object({
  message: z.string().optional(),
  tag: z.string().optional(),
});

const WebhookDataSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number(),
  responseMapping: z.array(
    z.object({
      jsonPath: z.string(),
      variableName: z.string(),
      scope: z.enum(['session', 'contact']),
    })
  ).optional(),
});

const GoogleSheetsDataSchema = z.object({
  spreadsheetId: z.string(),
  sheetName: z.string(),
  action: z.enum(['read_row', 'append_row', 'find_row']),
  data: z.record(z.string()).optional(),
  searchColumn: z.string().optional(),
  searchValue: z.string().optional(),
  resultVariable: z.string().optional(),
  resultScope: z.enum(['session', 'contact']).optional(),
});

const NocoDBDataSchema = z.object({
  baseId: z.string(),
  tableId: z.string(),
  action: z.enum(['create', 'read', 'update', 'find']),
  data: z.record(z.string()).optional(),
  filterField: z.string().optional(),
  filterValue: z.string().optional(),
  resultVariable: z.string().optional(),
  resultScope: z.enum(['session', 'contact']).optional(),
});

export const NodeDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(NodeType.SEND_TEXT), ...SendTextDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_IMAGE), ...SendMediaDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_VIDEO), ...SendMediaDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_AUDIO), ...SendMediaDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_DOCUMENT), ...SendDocumentDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_LOCATION), ...SendLocationDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_BUTTONS), ...SendButtonsDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_LIST), ...SendListDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_TEMPLATE), ...SendTemplateDataSchema.shape }),
  z.object({ type: z.literal(NodeType.ASK_QUESTION), ...AskQuestionDataSchema.shape }),
  z.object({ type: z.literal(NodeType.CONDITION), ...ConditionDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SET_VARIABLE), ...SetVariableDataSchema.shape }),
  z.object({ type: z.literal(NodeType.RANDOM_SPLIT), ...RandomSplitDataSchema.shape }),
  z.object({ type: z.literal(NodeType.START) }),
  z.object({ type: z.literal(NodeType.END) }),
  z.object({ type: z.literal(NodeType.JUMP_TO_FLOW), ...JumpToFlowDataSchema.shape }),
  z.object({ type: z.literal(NodeType.HUMAN_HANDOFF), ...HumanHandoffDataSchema.shape }),
  z.object({ type: z.literal(NodeType.WEBHOOK), ...WebhookDataSchema.shape }),
  z.object({ type: z.literal(NodeType.GOOGLE_SHEETS), ...GoogleSheetsDataSchema.shape }),
  z.object({ type: z.literal(NodeType.NOCODB), ...NocoDBDataSchema.shape }),
]);

export type NodeData = z.infer<typeof NodeDataSchema>;
