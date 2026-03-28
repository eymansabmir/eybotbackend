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
  mediaId: z.string().optional(),
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

const TemplateParameterSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('currency'),
    currency: z.object({ fallback_value: z.string(), code: z.string(), amount_1000: z.number() })
  }),
  z.object({ type: z.literal('date_time'), date_time: z.object({ fallback_value: z.string() }) }),
  z.object({ type: z.literal('image'), image: z.object({ link: z.string().optional(), id: z.string().optional() }) }),
  z.object({ type: z.literal('document'), document: z.object({ link: z.string().optional(), id: z.string().optional(), filename: z.string().optional() }) }),
  z.object({ type: z.literal('video'), video: z.object({ link: z.string().optional(), id: z.string().optional() }) }),
  z.object({ type: z.literal('location'), location: z.object({ latitude: z.number(), longitude: z.number(), name: z.string().optional(), address: z.string().optional() }) }),
]);

const TemplateButtonParameterSchema = z.object({
  type: z.enum(['payload', 'text', 'coupon_code']),
  payload: z.string().optional(),
  text: z.string().optional(),
  coupon_code: z.string().optional(),
});

const TemplateComponentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('header'),
    parameters: z.array(TemplateParameterSchema).optional(),
  }),
  z.object({
    type: z.literal('body'),
    parameters: z.array(TemplateParameterSchema).optional(),
  }),
  z.object({
    type: z.literal('button'),
    sub_type: z.enum(['quick_reply', 'url', 'button']),
    index: z.number(),
    parameters: z.array(TemplateButtonParameterSchema),
  }),
]);

const SendTemplateDataSchema = z.object({
  templateName: z.string(),
  languageCode: z.string(),
  components: z.array(TemplateComponentSchema).optional(),
});

const SendCarouselDataSchema = z.object({
  bodyText: z.string().max(1024).optional(),
  cards: z.array(
    z.object({
      headerType: z.enum(['image', 'video']),
      url: z.string().url(),
      bodyText: z.string().max(160).optional(),
      buttonType: z.enum(['cta_url', 'quick_reply']).optional(),
      ctaUrlButton: z.object({
        displayText: z.string().max(20),
        url: z.string().url(),
      }).optional(),
      quickReplyButtons: z.array(
        z.object({
          id: z.string(),
          title: z.string().max(20),
        })
      ).max(2).optional(),
    })
  ).min(1).max(10),
  interaction: NodeInteractionSchema.optional(),
});

const AskQuestionDataSchema = z.object({
  message: z.string(),
  variableName: z.string(),
  variableScope: z.enum(['session', 'contact']),
  inputType: InputTypeSchema,
  validation: ValidationRuleSchema.optional(),
  timeoutSeconds: z.number(),
});

const AskFileDataSchema = z.object({
  message: z.string(),
  variableName: z.string(),
  variableScope: z.enum(['session', 'contact']),
  timeoutSeconds: z.number(),
});

const NpsDataSchema = z.object({
  message: z.string(),
  variableName: z.string(),
  variableScope: z.enum(['session', 'contact']),
  length: z.number().default(10),
  startsAt: z.number().default(0),
  leftLabel: z.string().optional(),
  rightLabel: z.string().optional(),
  buttonLabel: z.string().optional(),
  timeoutSeconds: z.number().optional(),
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

const HttpRequestDataSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().int().positive().default(15000),
  fallbackText: z.string().optional(),
  responseMapping: z.array(
    z.object({
      jsonPath: z.string(),
      variableName: z.string(),
      scope: z.enum(['session', 'contact']),
    })
  ).optional(),
  credentialId: z.string().min(1).optional(),
  proxyCredentialsId: z.string().min(1).optional(),
});

const GoogleSheetsDataSchema = z.object({
  credentialId: z.string().optional(),
  action: z.enum(['insert_row', 'update_row', 'get_row']),
  spreadsheetId: z.string().optional(),
  spreadsheetName: z.string().optional(),
  sheetId: z.string().optional(),
  sheetName: z.string().optional(),
  rowId: z.union([z.string(), z.number()]).optional(),
  values: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  filter: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  data: z.record(z.string()).optional(),
  searchColumn: z.string().optional(),
  searchValue: z.string().optional(),
  resultVariable: z.string().optional(),
  resultScope: z.enum(['session', 'contact']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  responseMapping: z.array(z.any()).optional(),
}).passthrough();

const NocoDBDataSchema = z.object({
  credentialId: z.string().optional(),
  baseId: z.string().optional(),
  tableId: z.string().optional(),
  tableName: z.string().optional(),
  action: z.enum(['create', 'read', 'update', 'find', 'create_record', 'update_record', 'search_records']),
  filter: z.string().optional(),
  filterConditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).optional(),
  returnType: z.enum(['All', 'First', 'Last', 'Random']).optional(),
  fields: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  responseMapping: z.array(z.any()).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).passthrough();

const SendCardsDataSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      imageUrl: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      buttons: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          branchKey: z.string(),
        })
      ).max(3),
    })
  ).min(1),
  interaction: NodeInteractionSchema.optional(),
});

const SendReactionDataSchema = z.object({
  messageId: z.string(),
  emoji: z.string(),
});

const OpenAIDataSchema = z.object({
  mode: z.enum(['agent', 'voice', 'chat_completion', 'assistant', 'generate_variables', 'image']).optional(),
  voiceAction: z.enum(['create_speech', 'create_transcription']).optional(),
  credentialId: z.string().min(1).optional(),
  model: z.string().optional(),
  voice: z.string().optional(),
  prompt: z.string().optional(),
  messages: z.array(z.object({ role: z.enum(['system', 'user', 'assistant', 'dialogue']), content: z.string() })).optional(),
  tools: z.array(z.any()).optional(),
  audioUrl: z.string().optional(),
  systemPrompt: z.string().optional(),

  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  timeoutMs: z.number().int().positive().optional(),

  resultVariable: z.string().optional(),
  resultScope: z.enum(['session', 'contact']).optional(),
  sendResponseToUser: z.boolean().optional(),
  fallbackText: z.string().optional(),

  // Assistant mode
  assistantId: z.string().optional(),
  threadId: z.string().optional(),
  additionalInstructions: z.string().optional(),
  functions: z.array(z.any()).optional(),

  // Generate Variables mode
  variablesToExtract: z.array(z.any()).optional(),

  // Image mode
  imageSize: z.string().optional(),
  imageQuality: z.string().optional(),
}).passthrough();

const ElevenLabsDataSchema = z.object({
  credentialId: z.string().min(1),
  voiceId: z.string().min(1),
  text: z.string().min(1),
  modelId: z.string().optional(),
  outputFormat: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  resultVariable: z.string().min(1),
  resultScope: z.enum(['session', 'contact']).default('session'),
  sendResponseToUser: z.boolean().optional(),
  fallbackText: z.string().optional(),
});

const LanguageDataSchema = z.object({
  message: z.string(),
  variable: z.string(),
  timeoutSeconds: z.number().optional(),
});

const AnthropicDataSchema = z.object({
  mode: z.enum(['chat_completion', 'generate_variables', '']).optional(),
  credentialId: z.string().min(1).optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  messages: z.array(z.any()).optional(),
  systemPrompt: z.string().optional(),

  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),

  resultVariable: z.string().optional(),
  resultScope: z.enum(['session', 'contact']).optional(),
  sendResponseToUser: z.boolean().optional(),
  fallbackText: z.string().optional(),

  variablesToExtract: z.array(z.any()).optional(),
}).passthrough();

const DeepSeekDataSchema = z.object({
  mode: z.enum(['chat_completion', 'generate_variables', '']).optional(),
  credentialId: z.string().min(1).optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  messages: z.array(z.any()).optional(),
  systemPrompt: z.string().optional(),

  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),

  resultVariable: z.string().optional(),
  resultScope: z.enum(['session', 'contact']).optional(),
  sendResponseToUser: z.boolean().optional(),
  fallbackText: z.string().optional(),

  variablesToExtract: z.array(z.any()).optional(),
}).passthrough();

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
  z.object({ type: z.literal(NodeType.SEND_STICKER), ...SendMediaDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_CAROUSEL), ...SendCarouselDataSchema.shape }),
  z.object({ type: z.literal(NodeType.ASK_QUESTION), ...AskQuestionDataSchema.shape }),
  z.object({ type: z.literal(NodeType.ASK_FILE), ...AskFileDataSchema.shape }),
  z.object({ type: z.literal(NodeType.NPS), ...NpsDataSchema.shape }),
  z.object({ type: z.literal(NodeType.CONDITION), ...ConditionDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SET_VARIABLE), ...SetVariableDataSchema.shape }),
  z.object({ type: z.literal(NodeType.RANDOM_SPLIT), ...RandomSplitDataSchema.shape }),
  z.object({ type: z.literal(NodeType.START) }),
  z.object({ type: z.literal(NodeType.END) }),
  z.object({ type: z.literal(NodeType.JUMP_TO_FLOW), ...JumpToFlowDataSchema.shape }),
  z.object({ type: z.literal(NodeType.HUMAN_HANDOFF), ...HumanHandoffDataSchema.shape }),
  z.object({ type: z.literal(NodeType.WEBHOOK), ...WebhookDataSchema.shape }),
  z.object({ type: z.literal(NodeType.HTTP_REQUEST), ...HttpRequestDataSchema.shape }),
  z.object({ type: z.literal(NodeType.GOOGLE_SHEETS), ...GoogleSheetsDataSchema.shape }),
  z.object({ type: z.literal(NodeType.NOCODB) }).merge(NocoDBDataSchema),
  z.object({ type: z.literal(NodeType.SEND_CARDS), ...SendCardsDataSchema.shape }),
  z.object({ type: z.literal(NodeType.SEND_REACTION), ...SendReactionDataSchema.shape }),
  z.object({ type: z.literal(NodeType.OPENAI), ...OpenAIDataSchema.shape }),
  z.object({ type: z.literal(NodeType.ELEVENLABS), ...ElevenLabsDataSchema.shape }),
  z.object({ type: z.literal(NodeType.LANGUAGE), ...LanguageDataSchema.shape }),
  z.object({ type: z.literal(NodeType.ANTHROPIC) }).merge(AnthropicDataSchema),
  z.object({ type: z.literal(NodeType.DEEPSEEK) }).merge(DeepSeekDataSchema),
]);

export type NodeData = z.infer<typeof NodeDataSchema>;
