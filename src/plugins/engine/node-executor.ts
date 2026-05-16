import type { Node } from '../../schemas/node.schema';
import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError } from '../../shared/errors';
import type { VariableContext } from './variable-resolver';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { GraphTraverser } from './graph-traverser';
import type { OutboundMessage } from './engine.interface';
import type { WaitingFor } from '../../features/session/session.entity';
import { ISO_TO_NATIVE_NAME } from '../i18n/languages';
import { MUTATION_STRATEGIES, type MutationStrategy } from './mutation-strategies';
import { env } from '../../config/env';

export interface VariableMutation {
  scope: 'session' | 'contact';
  key: string;
  value: unknown;
}

export interface HistoryStep {
  nodeId: string;
  nodeType: NodeType;
  enteredAt: Date;
  exitedAt?: Date;
  branchTaken?: string;
  userInput?: string;
}

export interface NodeExecutionResult {
  nextNodeId: string | null;
  outboundMessages: OutboundMessage[];
  variableMutations: VariableMutation[];
  openAIRequest?: OpenAINodeRequest;
  elevenLabsRequest?: ElevenLabsNodeRequest;
  anthropicRequest?: AnthropicNodeRequest;
  deepSeekRequest?: DeepSeekNodeRequest;
  httpRequest?: HttpRequestNodeRequest;
  googleSheetsRequest?: GoogleSheetsNodeRequest;
  nocoDBRequest?: NocoDBNodeRequest;
  scriptRequest?: ScriptNodeRequest;
  waitForInput?: WaitingFor;
  historyStep: HistoryStep;
  isTerminal: boolean;
  languageChanged?: string;
  returnMark?: { nodeId: string };
  jumpToFlowId?: string;
  jumpToNodeId?: string;
  returnNodeId?: string;
}

export interface ScriptNodeRequest {
  nodeId: string;
  code: string;
  jumpToFlowId?: string;
  jumpToNodeId?: string;
  returnNodeId?: string;
}

export interface NodeExecutionInput {
  context: VariableContext;
  currentNode: Node;
  userInput?: string;
}

export interface OpenAINodeRequest {
  nodeId: string;
  mode: 'chat_completion' | 'voice' | 'assistant' | 'generate_variables' | 'image';
  voiceAction?: 'create_speech' | 'create_transcription';
  credentialId: string;
  model: string;
  voice?: string;
  prompt: string;
  messages?: { role: 'system' | 'user' | 'assistant' | 'dialogue'; content: string }[];
  tools?: any[];
  audioUrl?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  timeoutMs?: number;
  resultVariable: string;
  resultScope: 'session' | 'contact';
  sendResponseToUser: boolean;
  fallbackText?: string;
  // Assistant mode
  assistantId?: string;
  threadId?: string;
  threadIdStorage?: { scope: 'session' | 'contact'; key: string };
  additionalInstructions?: string;
  functions?: { name: string; code: string }[];
  // Generate Variables mode
  variablesToExtract?: { name: string; description?: string; type?: 'string' | 'number' | 'boolean' }[];
  // Image mode
  imageSize?: string;
  imageQuality?: string;
}

export interface ElevenLabsNodeRequest {
  nodeId: string;
  credentialId: string;
  voiceId: string;
  text: string;
  modelId?: string;
  outputFormat?: string;
  timeoutMs?: number;
  resultVariable: string;
  resultScope: 'session' | 'contact';
  sendResponseToUser: boolean;
  fallbackText?: string;
}

export interface AnthropicNodeRequest {
  nodeId: string;
  mode: 'chat_completion' | 'generate_variables';
  credentialId: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  resultVariable: string;
  resultScope: 'session' | 'contact';
  sendResponseToUser: boolean;
  fallbackText?: string;
  // Generate Variables mode
  variablesToExtract?: { name: string; description?: string; type?: 'string' | 'number' | 'boolean' }[];
}

export interface DeepSeekNodeRequest {
  nodeId: string;
  mode: 'chat_completion' | 'generate_variables';
  credentialId: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  resultVariable: string;
  resultScope: 'session' | 'contact';
  sendResponseToUser: boolean;
  fallbackText?: string;
  // Generate Variables mode
  variablesToExtract?: { name: string; description?: string; type?: 'string' | 'number' | 'boolean' }[];
}

export interface HttpRequestResponseMapping {
  jsonPath: string;
  variableName: string;
  scope: 'session' | 'contact';
}

export interface HttpRequestNodeRequest {
  nodeId: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'CONNECT' | 'OPTIONS' | 'TRACE';
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  fallbackText?: string;
  credentialId?: string;
  proxyCredentialsId?: string;
  responseMapping?: HttpRequestResponseMapping[];
}

export interface GoogleSheetsNodeRequest {
  nodeId: string;
  credentialId: string;
  action: 'insert_row' | 'update_row' | 'get_row';
  spreadsheetId: string;
  sheetId: string;
  rowId?: number;
  values?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  timeoutMs?: number;
  responseMapping?: HttpRequestResponseMapping[];
}

export interface NocoDBNodeRequest {
  nodeId: string;
  credentialId: string;
  action: 'create_record' | 'update_record' | 'search_records';
  tableId: string;
  viewId?: string;
  filter?: string;
  filterConditions?: Array<{ field: string; operator: string; value: string }>;
  returnType?: 'All' | 'First' | 'Last' | 'Random';
  fields?: Array<{ key: string; value: string }>;
  timeoutMs?: number;
  responseMapping?: HttpRequestResponseMapping[];
}

const LOGIC_TYPES = new Set<NodeType>([
  NodeType.CONDITION,
  NodeType.SET_VARIABLE,
  NodeType.RANDOM_SPLIT,
  NodeType.START,
  NodeType.JUMP_TO_FLOW,
  NodeType.REDIRECT,
  NodeType.SCRIPT,
  NodeType.JUMP,
  NodeType.RETURN,
]);

export class NodeExecutor {
  constructor(
    private readonly resolver: VariableResolver,
    private readonly evaluator: ConditionEvaluator,
  ) { }

  isLogicNode(type: NodeType): boolean {
    return LOGIC_TYPES.has(type);
  }

  async execute(input: NodeExecutionInput, traverser: GraphTraverser): Promise<NodeExecutionResult> {
    const { context, currentNode, userInput } = input;
    const enteredAt = new Date();

    switch (currentNode.type) {
      case NodeType.START:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser);

      case NodeType.END:
        return {
          nextNodeId: null, outboundMessages: [], variableMutations: [], isTerminal: true,
          historyStep: { nodeId: currentNode.id, nodeType: currentNode.type, enteredAt, exitedAt: new Date() },
        };

      case NodeType.SEND_TEXT:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [
          {
            type: currentNode.type,
            payload: {
              message: this.text(currentNode.data['message'] as string, context),
              footer: currentNode.data['footer'] ? this.text(currentNode.data['footer'] as string, context) : undefined,
            }
          },
        ]);

      case NodeType.SEND_IMAGE:
      case NodeType.SEND_VIDEO:
      case NodeType.SEND_AUDIO:
      case NodeType.SEND_DOCUMENT:
      case NodeType.SEND_STICKER:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            url: currentNode.data['url'] ? this.resolveMediaUrl(this.text(currentNode.data['url'] as string, context)) : undefined,
            mediaId: currentNode.data['mediaId'] ? this.text(currentNode.data['mediaId'] as string, context) : undefined,
            ...(currentNode.data['caption'] ? { caption: this.text(currentNode.data['caption'] as string, context) } : {}),
            ...(currentNode.data['filename'] ? { filename: currentNode.data['filename'] } : {}),
          },
        }]);

      case NodeType.SEND_LOCATION:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            lat: parseFloat(this.text(currentNode.data['lat'] as string, context)),
            lng: parseFloat(this.text(currentNode.data['lng'] as string, context)),
            name: currentNode.data['name'] ? this.text(currentNode.data['name'] as string, context) : undefined,
            address: currentNode.data['address'] ? this.text(currentNode.data['address'] as string, context) : undefined,
          }
        }]);

      case NodeType.WAIT:
        return this.handleWaitNode(currentNode, enteredAt, traverser, userInput);

      case NodeType.SEND_BUTTONS:
        return this.handleButtons(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.SEND_LIST:
        return this.handleList(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.SEND_TEMPLATE: {
        const components = (currentNode.data['components'] ?? []) as any[];
        const resolvedComponents = components.map(comp => ({
          ...comp,
          parameters: comp.parameters?.map((param: any) => {
            const p = { ...param };
            if (typeof p.text === 'string') p.text = this.text(p.text, context);
            if (p.image?.link) p.image = { ...p.image, link: this.text(p.image.link, context) };
            if (p.video?.link) p.video = { ...p.video, link: this.text(p.video.link, context) };
            if (p.document?.link) p.document = { ...p.document, link: this.text(p.document.link, context) };
            if (typeof p.payload === 'string') p.payload = this.text(p.payload, context);
            return p;
          })
        }));

        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            templateName: this.text(currentNode.data['templateName'] as string, context),
            languageCode: this.text(currentNode.data['languageCode'] as string, context),
            components: resolvedComponents,
          },
        }]);
      }

      case NodeType.SEND_REACTION: {
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            messageId: this.text(currentNode.data['messageId'] as string, context),
            emoji: this.text(currentNode.data['emoji'] as string, context),
          },
        }]);
      }

      case NodeType.SEND_CAROUSEL:
        return this.handleCarousel(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.LOCATION_REQUEST:
        return this.handleLocationRequest(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.ASK_QUESTION:
        return this.handleAskQuestion(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.ASK_FILE:
        return this.handleAskFile(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.NPS:
        return this.handleNps(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.LANGUAGE:
        return this.handleLanguageNode(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.MEDIA_CONDITIONAL:
        return this.handleMediaConditional(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.CONDITION:
        return this.handleCondition(currentNode, context, enteredAt, traverser);

      case NodeType.SET_VARIABLE:
        return this.handleSetVariable(currentNode, context, enteredAt, traverser);

      case NodeType.RANDOM_SPLIT:
        return this.handleRandomSplit(currentNode, enteredAt, traverser);

      case NodeType.REDIRECT:
        return this.handleRedirect(currentNode, context, enteredAt, traverser);

      case NodeType.SCRIPT:
        return this.handleScript(currentNode, context, enteredAt, traverser);

      case NodeType.JUMP_TO_FLOW:
        return this.handleJumpToFlow(currentNode, enteredAt);
      case NodeType.BOT_NODE:
        return this.handleBotNode(currentNode, enteredAt, traverser);
      case NodeType.WAIT:
        return this.handleWaitNode(currentNode, enteredAt, traverser, userInput);

      case NodeType.JUMP:
        return this.handleJump(currentNode, enteredAt, traverser);
      case NodeType.RETURN:
        return this.handleReturn(currentNode, context, enteredAt, traverser);

      case NodeType.HUMAN_HANDOFF: {
        const msg = currentNode.data['message'] ? this.text(currentNode.data['message'] as string, context) : undefined;
        return {
          nextNodeId: null, outboundMessages: msg ? [{ type: currentNode.type, payload: { message: msg, tag: currentNode.data['tag'] } }] : [],
          variableMutations: [], isTerminal: true,
          historyStep: { nodeId: currentNode.id, nodeType: currentNode.type, enteredAt, exitedAt: new Date() },
        };
      }

      case NodeType.WEBHOOK:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [
          { type: currentNode.type, payload: currentNode.data as Record<string, unknown> },
        ]);

      case NodeType.NOCODB:
        return this.handleNocoDB(currentNode, context, enteredAt, traverser);

      case NodeType.GOOGLE_SHEETS:
        return this.handleGoogleSheets(currentNode, context, enteredAt, traverser);

      case NodeType.SEND_CARDS:
        return this.handleCards(currentNode, context, enteredAt, traverser, userInput);
      case NodeType.OPENAI:
        return this.handleOpenAI(currentNode, context, enteredAt, traverser);

      case NodeType.ELEVENLABS:
        return this.handleElevenLabs(currentNode, context, enteredAt, traverser);

      case NodeType.ANTHROPIC:
        return this.handleAnthropic(currentNode, context, enteredAt, traverser);

      case NodeType.DEEPSEEK:
        return this.handleDeepSeek(currentNode, context, enteredAt, traverser);

      case NodeType.HTTP_REQUEST:
        return this.handleHttpRequest(currentNode, context, enteredAt, traverser);


      default:
        throw new FlowExecutionError(`Unsupported node type: ${(currentNode as Node).type}`, currentNode.id);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private text(template: string, ctx: VariableContext): string {
    return this.resolver.resolve(template, ctx);
  }

  private resolveMediaUrl(url: string): string {
    if (!url || url.startsWith('http') || (url.includes('{{') && url.includes('}}'))) {
      return url;
    }

    const base = env.BASE_MEDIA_URL;
    const bucketName = env.GCS_BUCKET_NAME;

    if (base) {
      return `${base}/${url.replace(/^\/+/, '')}`;
    }

    if (bucketName) {
      return `https://storage.googleapis.com/${bucketName}/${url.replace(/^\/+/, '')}`;
    }

    return url;
  }

  private parseThreadIdStorage(template: string): { scope: 'session' | 'contact'; key: string } | undefined {
    const match = /^\{\{\s*(session|contact)\.([a-zA-Z0-9_]+)\s*\}\}$/.exec(template.trim());
    if (!match) return undefined;
    const scope = match[1];
    const key = match[2];
    if (!scope || !key) return undefined;
    return {
      scope: scope as 'session' | 'contact',
      key,
    };
  }

  private resolveTemplateWithScopeFallback(template: string, ctx: VariableContext): string {
    const trimmedTemplate = template.trim();
    if (!trimmedTemplate) return '';

    const resolved = this.text(trimmedTemplate, ctx).trim();
    const hasTemplateMarkers = trimmedTemplate.includes('{{') || trimmedTemplate.includes('}}');
    if (!hasTemplateMarkers || resolved !== trimmedTemplate) {
      return resolved;
    }

    const scopedTemplate = this.parseThreadIdStorage(trimmedTemplate);
    if (scopedTemplate) {
      const fallbackValue =
        scopedTemplate.scope === 'session'
          ? ctx.contact.customFields[scopedTemplate.key]
          : ctx.session.variables[scopedTemplate.key];

      if (fallbackValue !== undefined && fallbackValue !== null) {
        return String(fallbackValue).trim();
      }
    }

    const bareTemplateMatch = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(trimmedTemplate);
    const bareKey = bareTemplateMatch?.[1];
    if (bareKey) {
      const sessionValue = ctx.session.variables[bareKey];
      if (sessionValue !== undefined && sessionValue !== null) {
        return String(sessionValue).trim();
      }

      const contactValue = ctx.contact.customFields[bareKey];
      if (contactValue !== undefined && contactValue !== null) {
        return String(contactValue).trim();
      }
    }

    return resolved;
  }

  private handleOpenAI(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const modeRaw = data['mode'] as string | undefined;
    let mode: OpenAINodeRequest['mode'] = 'chat_completion';
    if (modeRaw === 'voice') mode = 'voice';
    else if (modeRaw === 'assistant') mode = 'assistant';
    else if (modeRaw === 'generate_variables') mode = 'generate_variables';
    else if (modeRaw === 'image') mode = 'image';

    const rawThreadIdTemplate = typeof data['threadId'] === 'string' ? data['threadId'].trim() : '';
    const resolvedThreadId = rawThreadIdTemplate ? this.text(rawThreadIdTemplate, ctx).trim() : '';
    const resolvedAudioUrl =
      typeof data['audioUrl'] === 'string'
        ? this.resolveMediaUrl(this.resolveTemplateWithScopeFallback(data['audioUrl'], ctx))
        : undefined;
    const threadIdStorage = rawThreadIdTemplate ? this.parseThreadIdStorage(rawThreadIdTemplate) : undefined;
    const hasThreadTemplateMarkers = rawThreadIdTemplate.includes('{{') || rawThreadIdTemplate.includes('}}');
    const unresolvedTemplate =
      !!rawThreadIdTemplate &&
      !!threadIdStorage &&
      resolvedThreadId === rawThreadIdTemplate;

    if (mode === 'assistant' && hasThreadTemplateMarkers && !threadIdStorage) {
      throw new FlowExecutionError(
        'Assistant threadId template must be in the format {{session.key}} or {{contact.key}}',
        node.id,
      );
    }

    const request: OpenAINodeRequest = {
      nodeId: node.id,
      mode,
      ...(mode === 'voice'
        ? {
          voiceAction:
            data['voiceAction'] === 'create_transcription'
              ? 'create_transcription' as const
              : 'create_speech' as const,
        }
        : {}),
      credentialId: String(data['credentialId'] ?? ''),
      model: String(data['model'] ?? ''),
      ...(typeof data['voice'] === 'string' ? { voice: this.text(data['voice'], ctx) } : {}),
      prompt: this.text(String(data['prompt'] ?? ''), ctx),
      messages: Array.isArray(data['messages'])
        ? data['messages'].map((m: any) => ({
          role: m.role,
          content: this.text(String(m.content ?? ''), ctx),
        }))
        : undefined,
      tools: Array.isArray(data['tools']) ? data['tools'] : undefined,
      ...(resolvedAudioUrl ? { audioUrl: resolvedAudioUrl } : {}),
      ...(typeof data['systemPrompt'] === 'string'
        ? { systemPrompt: this.text(data['systemPrompt'], ctx) }
        : {}),
      ...(typeof data['temperature'] === 'number' ? { temperature: data['temperature'] } : {}),
      ...(typeof data['maxTokens'] === 'number' ? { maxTokens: data['maxTokens'] } : {}),
      ...(typeof data['topP'] === 'number' ? { topP: data['topP'] } : {}),
      ...(typeof data['frequencyPenalty'] === 'number'
        ? { frequencyPenalty: data['frequencyPenalty'] }
        : {}),
      ...(typeof data['presencePenalty'] === 'number'
        ? { presencePenalty: data['presencePenalty'] }
        : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      resultVariable: String(data['resultVariable'] ?? ''),
      resultScope: (data['resultScope'] as 'session' | 'contact') ?? 'session',
      sendResponseToUser: data['sendResponseToUser'] === true,
      ...(typeof data['fallbackText'] === 'string'
        ? { fallbackText: this.text(data['fallbackText'], ctx) }
        : {}),
      // Assistant mode fields
      ...(typeof data['assistantId'] === 'string' ? { assistantId: data['assistantId'] } : {}),
      ...(resolvedThreadId && !unresolvedTemplate ? { threadId: resolvedThreadId } : {}),
      ...(threadIdStorage ? { threadIdStorage } : {}),
      ...(typeof data['additionalInstructions'] === 'string'
        ? { additionalInstructions: this.text(data['additionalInstructions'], ctx) }
        : {}),
      ...(Array.isArray(data['functions']) ? { functions: data['functions'] as { name: string; code: string }[] } : {}),
      // Generate Variables mode fields
      ...(Array.isArray(data['variablesToExtract'])
        ? { variablesToExtract: data['variablesToExtract'] as { name: string; description?: string; type?: 'string' | 'number' | 'boolean' }[] }
        : {}),
      // Image mode fields
      ...(typeof data['imageSize'] === 'string' ? { imageSize: data['imageSize'] } : {}),
      ...(typeof data['imageQuality'] === 'string' ? { imageQuality: data['imageQuality'] } : {}),
    };

    return {
      ...base,
      openAIRequest: request,
    };
  }

  private handleAnthropic(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const mode = (data['mode'] as 'chat_completion' | 'generate_variables') || 'chat_completion';

    const request: AnthropicNodeRequest = {
      nodeId: node.id,
      mode,
      credentialId: String(data['credentialId'] ?? ''),
      model: String(data['model'] ?? ''),
      prompt: this.text(String(data['prompt'] ?? ''), ctx),
      ...(typeof data['systemPrompt'] === 'string' ? { systemPrompt: this.text(data['systemPrompt'], ctx) } : {}),
      ...(typeof data['temperature'] === 'number' ? { temperature: data['temperature'] } : {}),
      ...(typeof data['maxTokens'] === 'number' ? { maxTokens: data['maxTokens'] } : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      resultVariable: String(data['resultVariable'] ?? ''),
      resultScope: (data['resultScope'] as 'session' | 'contact') ?? 'session',
      sendResponseToUser: data['sendResponseToUser'] === true,
      ...(typeof data['fallbackText'] === 'string' ? { fallbackText: this.text(data['fallbackText'], ctx) } : {}),
      ...(Array.isArray(data['variablesToExtract'])
        ? { variablesToExtract: data['variablesToExtract'] as any }
        : {}),
    };

    return {
      ...base,
      anthropicRequest: request,
    };
  }

  private handleDeepSeek(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const mode = (data['mode'] as 'chat_completion' | 'generate_variables') || 'chat_completion';

    const request: DeepSeekNodeRequest = {
      nodeId: node.id,
      mode,
      credentialId: String(data['credentialId'] ?? ''),
      model: String(data['model'] ?? ''),
      prompt: this.text(String(data['prompt'] ?? ''), ctx),
      ...(typeof data['systemPrompt'] === 'string' ? { systemPrompt: this.text(data['systemPrompt'], ctx) } : {}),
      ...(typeof data['temperature'] === 'number' ? { temperature: data['temperature'] } : {}),
      ...(typeof data['maxTokens'] === 'number' ? { maxTokens: data['maxTokens'] } : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      resultVariable: String(data['resultVariable'] ?? ''),
      resultScope: (data['resultScope'] as 'session' | 'contact') ?? 'session',
      sendResponseToUser: data['sendResponseToUser'] === true,
      ...(typeof data['fallbackText'] === 'string' ? { fallbackText: this.text(data['fallbackText'], ctx) } : {}),
      ...(Array.isArray(data['variablesToExtract'])
        ? { variablesToExtract: data['variablesToExtract'] as any }
        : {}),
    };

    return {
      ...base,
      deepSeekRequest: request,
    };
  }

  private handleElevenLabs(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const request: ElevenLabsNodeRequest = {
      nodeId: node.id,
      credentialId: String(data['credentialId'] ?? ''),
      voiceId: String(data['voiceId'] ?? ''),
      text: this.text(String(data['text'] ?? ''), ctx),
      ...(typeof data['modelId'] === 'string' ? { modelId: this.text(data['modelId'], ctx) } : {}),
      ...(typeof data['outputFormat'] === 'string' ? { outputFormat: data['outputFormat'] } : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      resultVariable: String(data['resultVariable'] ?? ''),
      resultScope: (data['resultScope'] as 'session' | 'contact') ?? 'session',
      sendResponseToUser: data['sendResponseToUser'] === true,
      ...(typeof data['fallbackText'] === 'string'
        ? { fallbackText: this.text(data['fallbackText'], ctx) }
        : {}),
    };

    return {
      ...base,
      elevenLabsRequest: request,
    };
  }

  private defaultResult(
    node: Node,
    branchKey: string,
    enteredAt: Date,
    traverser: GraphTraverser,
    messages: OutboundMessage[] = [],
    mutations: VariableMutation[] = [],
  ): NodeExecutionResult {
    const next = traverser.getNextNode(node.id, branchKey);
    return {
      nextNodeId: next?.id ?? null,
      outboundMessages: messages,
      variableMutations: mutations,
      isTerminal: false,
      historyStep: { nodeId: node.id, nodeType: node.type, enteredAt, exitedAt: new Date(), branchTaken: branchKey },
    };
  }

  private handleHttpRequest(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const resolveRecord = (value: unknown): Record<string, string> | undefined => {
      if (!value || typeof value !== 'object') return undefined;
      const out: Record<string, string> = {};
      for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'string') {
          out[key] = this.text(raw, ctx);
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };

    const responseMapping = Array.isArray(data['responseMapping'])
      ? (data['responseMapping'] as Array<Record<string, unknown>>)
        .filter((item) => typeof item['jsonPath'] === 'string' && typeof item['variableName'] === 'string')
        .map((item) => ({
          jsonPath: item['jsonPath'] as string,
          variableName: item['variableName'] as string,
          scope: (item['scope'] === 'contact' ? 'contact' : 'session') as 'session' | 'contact',
        }))
      : undefined;

    const resolvedHeaders = resolveRecord(data['headers']);
    const resolvedQueryParams = resolveRecord(data['queryParams']);

    const request: HttpRequestNodeRequest = {
      nodeId: node.id,
      url: this.text(String(data['url'] ?? ''), ctx),
      method: ((data['method'] as string) ?? 'GET').toUpperCase() as HttpRequestNodeRequest['method'],
      ...(resolvedHeaders ? { headers: resolvedHeaders } : {}),
      ...(resolvedQueryParams ? { queryParams: resolvedQueryParams } : {}),
      ...(typeof data['body'] === 'string' ? { body: this.text(data['body'], ctx) } : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      ...(typeof data['fallbackText'] === 'string' ? { fallbackText: this.text(data['fallbackText'], ctx) } : {}),
      ...(typeof data['credentialId'] === 'string' ? { credentialId: data['credentialId'] } : {}),
      ...(typeof data['proxyCredentialsId'] === 'string' ? { proxyCredentialsId: data['proxyCredentialsId'] } : {}),
      ...(responseMapping && responseMapping.length > 0 ? { responseMapping } : {}),
    };

    return {
      ...base,
      httpRequest: request,
    };
  }

  private handleGoogleSheets(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const parseRecord = (value: unknown): Record<string, unknown> | undefined => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(this.text(value, ctx));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            value = parsed;
          } else {
            return undefined;
          }
        } catch {
          return undefined;
        }
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const out: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value)) {
        if (typeof raw === 'string') {
          out[key] = this.text(raw, ctx);
        } else {
          out[key] = raw;
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };

    const responseMapping = Array.isArray(data['responseMapping'])
      ? (data['responseMapping'] as Array<Record<string, unknown>>)
        .filter(
          (item) =>
            typeof item['jsonPath'] === 'string' &&
            typeof item['variableName'] === 'string' &&
            (item['scope'] === 'session' || item['scope'] === 'contact'),
        )
        .map((item) => ({
          jsonPath: item['jsonPath'] as string,
          variableName: item['variableName'] as string,
          scope: item['scope'] as 'session' | 'contact',
        }))
      : undefined;

    const action = (data['action'] as string) || 'insert_row';

    const request: GoogleSheetsNodeRequest = {
      nodeId: node.id,
      credentialId: String(data['credentialId'] ?? ''),
      action: action as 'insert_row' | 'update_row' | 'get_row',
      spreadsheetId: this.text(String(data['spreadsheetId'] ?? ''), ctx),
      sheetId: String(data['sheetId'] ?? ''),
      ...(data['rowId'] !== undefined ? { rowId: Number(this.text(String(data['rowId']), ctx)) } : {}),
      ...(data['values'] ? { values: parseRecord(data['values']) } : {}),
      ...(data['filter'] ? { filter: parseRecord(data['filter']) } : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      ...(responseMapping && responseMapping.length > 0 ? { responseMapping } : {}),
    };

    return {
      ...base,
      googleSheetsRequest: request,
    };
  }

  private handleRedirect(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const url = node.data['url'] as string;
    const isNewTab = node.data['isNewTab'] as boolean;

    const resolvedUrl = this.text(url, ctx);

    return this.defaultResult(node, 'default', enteredAt, traverser, [
      {
        type: NodeType.REDIRECT,
        payload: {
          url: resolvedUrl,
          isNewTab,
        }
      }
    ]);
  }

  private handleScript(
    node: Node,
    _ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const code = node.data['content'] as string | undefined;
    if (!code || code.trim() === '') {
      return this.defaultResult(node, 'default', enteredAt, traverser);
    }

    return {
      ...this.defaultResult(node, 'default', enteredAt, traverser),
      scriptRequest: {
        nodeId: node.id,
        code,
      },
    };
  }

  private handleJump(
    node: Node,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const targetNodeId = node.data['targetNodeId'] as string;
    // Support both 'default' and 'next' for backward compatibility during transition
    const nextNodeAfterJump = traverser.getNextNode(node.id, 'default') || traverser.getNextNode(node.id, 'next');

    console.log(`[NodeExecutor] JUMP node ${node.id} executing. Target: ${targetNodeId}, Return point: ${nextNodeAfterJump?.id}`);

    return {
      nextNodeId: targetNodeId || null,
      outboundMessages: [],
      variableMutations: [],
      isTerminal: false,
      returnMark: nextNodeAfterJump ? { nodeId: nextNodeAfterJump.id } : undefined,
      historyStep: {
        nodeId: node.id,
        nodeType: node.type,
        enteredAt,
        exitedAt: new Date(),
        branchTaken: targetNodeId
      },
    };
  }

  private handleReturn(
    node: Node,
    ctx: { session: { returnMark?: { nodeId: string } } },
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const returnPoint = ctx.session.returnMark;

    console.log(`[NodeExecutor] RETURN node ${node.id} executing. Return point from session: ${returnPoint?.nodeId}`);

    if (!returnPoint) {
      console.warn(`[NodeExecutor] RETURN node ${node.id} called but no returnMark found in session.`);
      // If no return point, just go to default next node of Return block
      return this.defaultResult(node, 'default', enteredAt, traverser);
    }

    return {
      nextNodeId: returnPoint.nodeId,
      outboundMessages: [],
      variableMutations: [],
      isTerminal: false,
      historyStep: {
        nodeId: node.id,
        nodeType: node.type,
        enteredAt,
        exitedAt: new Date(),
        branchTaken: 'return'
      },
    };
  }

  private handleNocoDB(
    node: Node,
    ctx: VariableContext,
    enteredAt: Date,
    traverser: GraphTraverser,
  ): NodeExecutionResult {
    const base = this.defaultResult(node, 'default', enteredAt, traverser);
    const data = node.data as Record<string, unknown>;

    const resolveFields = (value: unknown): Array<{ key: string; value: string }> | undefined => {
      if (!Array.isArray(value)) return undefined;
      const out: Array<{ key: string; value: string }> = [];
      for (const item of value) {
        if (item && typeof item === 'object' && typeof item.key === 'string' && typeof item.value === 'string') {
          out.push({
            key: this.text(item.key, ctx),
            value: this.text(item.value, ctx),
          });
        }
      }
      return out.length > 0 ? out : undefined;
    };

    const action = (data['action'] as string) || 'create_record';

    const request: NocoDBNodeRequest = {
      nodeId: node.id,
      credentialId: String(data['credentialId'] ?? ''),
      action: action as 'create_record' | 'update_record' | 'search_records',
      tableId: this.text(String(data['tableId'] ?? ''), ctx),
      viewId: data['viewId'] ? this.text(String(data['viewId']), ctx) : undefined,
      filter: data['filter'] ? this.text(String(data['filter']), ctx) : undefined,
      filterConditions: Array.isArray(data['filterConditions'])
        ? data['filterConditions'].map((c: any) => ({
          field: c.field,
          operator: c.operator,
          value: this.text(String(c.value ?? ''), ctx)
        }))
        : undefined,
      returnType: data['returnType'] as any,
      ...(data['fields'] ? { fields: resolveFields(data['fields']) } : {}),
      ...(typeof data['timeoutMs'] === 'number' ? { timeoutMs: data['timeoutMs'] } : {}),
      ...(data['responseMapping'] ? { responseMapping: data['responseMapping'] as HttpRequestResponseMapping[] } : {}),
    };

    return {
      ...base,
      nocoDBRequest: request,
    };
  }

  private handleCards(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const interaction = node.data['interaction'] as any;
    const items = (node.data['items'] ?? []) as any[];

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 300) as number) * 1000);

      const options = items.flatMap((item: any) =>
        (item.buttons ?? []).map((b: any) => ({ id: b.id, label: b.text, branchKey: b.branchKey }))
      );

      const messages: OutboundMessage[] = items.map((item: any) => ({
        type: node.type,
        payload: {
          imageUrl: item.imageUrl ? this.resolveMediaUrl(this.text(item.imageUrl, ctx)) : undefined,
          title: item.title ? this.text(item.title, ctx) : undefined,
          description: item.description ? this.text(item.description, ctx) : undefined,
          buttons: item.buttons?.map((b: any) => ({ id: b.id, title: this.text(b.text, ctx) })) ?? [],
        }
      }));

      return {
        nextNodeId: node.id,
        outboundMessages: messages,
        variableMutations: [], isTerminal: false,
        waitForInput: {
          type: 'choice',
          options,
          defaultBranchKey: interaction.input?.defaultBranchKey,
          variableName: interaction.input?.variableName,
          variableScope: interaction.input?.variableScope,
          since,
          timeoutAt
        },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    if (interaction?.mode === 'input' && userInput !== undefined) {
      const options = items.flatMap((item: any) =>
        (item.buttons ?? []).map((b: any) => ({ id: b.id, branchKey: b.branchKey }))
      );
      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction.input?.defaultBranchKey ?? 'default';
      const mutations: VariableMutation[] = [];
      if (interaction.input?.variableName) {
        const scope = (interaction.input.variableScope || 'session') as 'session' | 'contact';
        mutations.push({ scope, key: interaction.input.variableName as string, value: userInput });
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

    const messages: OutboundMessage[] = items.map((item: any) => ({
      type: node.type,
      payload: {
        imageUrl: item.imageUrl ? this.resolveMediaUrl(this.text(item.imageUrl, ctx)) : undefined,
        title: item.title ? this.text(item.title, ctx) : undefined,
        description: item.description ? this.text(item.description, ctx) : undefined,
        buttons: item.buttons?.map((b: any) => ({ id: b.id, title: this.text(b.text, ctx) })) ?? [],
      }
    }));

    return this.defaultResult(node, 'default', enteredAt, traverser, messages);
  }

  private handleAskQuestion(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const { variableName, variableScope, timeoutSeconds, message } = node.data as Record<string, any>;
    const resolvedMessage = this.text((message as string) || '', ctx);

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 300) as number) * 1000);
      return {
        nextNodeId: node.id, outboundMessages: [{ type: node.type, payload: { message: resolvedMessage } }],
        variableMutations: [], isTerminal: false,
        waitForInput: { type: 'text', variableName, variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    const result = this.defaultResult(node, 'default', enteredAt, traverser, [], [
      { scope: variableScope as 'session' | 'contact', key: variableName as string, value: userInput },
    ]);
    return { ...result, historyStep: { ...result.historyStep, userInput } };
  }

  private handleAskFile(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const { variableName, variableScope, timeoutSeconds, message } = node.data as Record<string, any>;
    const resolvedMessage = this.text(message as string, ctx);

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 300) as number) * 1000);
      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { message: resolvedMessage } }],
        variableMutations: [],
        isTerminal: false,
        waitForInput: { type: 'file', variableName, variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    const result = this.defaultResult(node, 'default', enteredAt, traverser, [], [
      { scope: variableScope as 'session' | 'contact', key: variableName as string, value: userInput },
    ]);
    return { ...result, historyStep: { ...result.historyStep, userInput } };
  }

  private handleNps(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const { message, variableName, variableScope, timeoutSeconds } = node.data as Record<string, any>;
    const resolvedMessage = this.text(message as string, ctx);

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 300) as number) * 1000);

      // NPS is effectively a choice node with 0-10
      const length = node.data['length'] ?? 10;
      const startsAt = node.data['startsAt'] ?? 1;
      const options = [];
      for (let i = 0; i < length; i++) {
        const val = (startsAt + i).toString();
        options.push({ id: val, branchKey: 'default', label: val });
      }

      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { ...node.data, message: resolvedMessage } }],
        variableMutations: [], isTerminal: false,
        waitForInput: { type: 'choice', options, variableName, variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    const result = this.defaultResult(node, 'default', enteredAt, traverser, [], [
      { scope: variableScope as 'session' | 'contact', key: variableName as string, value: userInput },
    ]);
    return { ...result, historyStep: { ...result.historyStep, userInput } };
  }

  private handleButtons(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const body = this.text(node.data['body'] as string, ctx);
    const footer = node.data['footer'] ? this.text(node.data['footer'] as string, ctx) : undefined;
    const interaction = node.data['interaction'] as any;

    logger.debug(
      { nodeId: node.id, hasInteraction: !!interaction, mode: interaction?.mode, variableName: interaction?.input?.variableName, variableScope: interaction?.input?.variableScope, userInput },
      '[handleButtons] Interaction state'
    );

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 300) as number) * 1000);
      const options = interaction.input?.options ?? (node.data['buttons'] as any[])?.map((b: any) => ({ id: b.id, label: b.label, branchKey: b.id })) ?? [];
      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { body, footer, buttons: node.data['buttons'] } }],
        variableMutations: [], isTerminal: false,
        waitForInput: { type: 'choice', options, defaultBranchKey: interaction.input?.defaultBranchKey, variableName: interaction.input?.variableName, variableScope: interaction.input?.variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    if (interaction?.mode === 'input' && userInput !== undefined) {
      const options = interaction.input?.options ?? (node.data['buttons'] as any[])?.map((b: any) => ({ id: b.id, label: b.title, branchKey: b.id })) ?? [];
      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction.input?.defaultBranchKey ?? 'default';
      const mutations: VariableMutation[] = [];

      if (interaction.input?.variableName) {
        // Save the label/title if available, otherwise fallback to the ID/userInput
        const valueToSave = selected?.label ?? userInput;
        const scope = (interaction.input.variableScope || 'session') as 'session' | 'contact';
        mutations.push({
          scope,
          key: interaction.input.variableName as string,
          value: valueToSave
        });
        logger.info(
          { nodeId: node.id, variableName: interaction.input.variableName, scope, value: valueToSave },
          '[handleButtons] Storing user choice in variable'
        );
      } else {
        logger.warn(
          { nodeId: node.id, variableName: interaction.input?.variableName, variableScope: interaction.input?.variableScope },
          '[handleButtons] No variableName or variableScope configured — user choice will NOT be stored'
        );
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

    logger.debug({ nodeId: node.id }, '[handleButtons] Falling through to output-only mode (no interaction.mode=input)');
    return this.defaultResult(node, 'default', enteredAt, traverser, [
      { type: node.type, payload: { body, footer, buttons: node.data['buttons'] } },
    ]);
  }

  private handleList(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const body = this.text(node.data['body'] as string, ctx);
    const interaction = node.data['interaction'] as any;

    logger.debug(
      { nodeId: node.id, hasInteraction: !!interaction, mode: interaction?.mode, variableName: interaction?.input?.variableName, variableScope: interaction?.input?.variableScope, userInput },
      '[handleList] Interaction state'
    );

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 300) as number) * 1000);
      const options = interaction.input?.options ?? (node.data['sections'] as any[])?.flatMap((s: any) => s.rows?.map((r: any) => ({ id: r.id, label: r.title, branchKey: r.id }))) ?? [];
      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { body, buttonTitle: node.data['buttonTitle'], sections: node.data['sections'] } }],
        variableMutations: [], isTerminal: false,
        waitForInput: { type: 'choice', options, defaultBranchKey: interaction.input?.defaultBranchKey, variableName: interaction.input?.variableName, variableScope: interaction.input?.variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    if (interaction?.mode === 'input' && userInput !== undefined) {
      const options = interaction.input?.options ?? (node.data['sections'] as any[])?.flatMap((s: any) => s.rows?.map((r: any) => ({ id: r.id, label: r.title, branchKey: r.id }))) ?? [];
      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction.input?.defaultBranchKey ?? 'default';
      const mutations: VariableMutation[] = [];

      if (interaction.input?.variableName) {
        // Save the label/title if available, otherwise fallback to the ID/userInput
        const valueToSave = selected?.label ?? userInput;
        const scope = (interaction.input.variableScope || 'session') as 'session' | 'contact';
        mutations.push({
          scope,
          key: interaction.input.variableName as string,
          value: valueToSave
        });
        logger.info(
          { nodeId: node.id, variableName: interaction.input.variableName, scope, value: valueToSave },
          '[handleList] Storing user choice in variable'
        );
      } else {
        logger.warn(
          { nodeId: node.id, variableName: interaction.input?.variableName, variableScope: interaction.input?.variableScope },
          '[handleList] No variableName or variableScope configured — user choice will NOT be stored'
        );
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

    logger.debug({ nodeId: node.id }, '[handleList] Falling through to output-only mode (no interaction.mode=input)');
    return this.defaultResult(node, 'default', enteredAt, traverser, [
      { type: node.type, payload: { body, buttonTitle: node.data['buttonTitle'], sections: node.data['sections'] } },
    ]);
  }

  private handleCarousel(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const bodyText = node.data['bodyText'] ? this.text(node.data['bodyText'] as string, ctx) : undefined;
    const cards = (node.data['cards'] as any[])?.map(card => ({
      ...card,
      url: card.url ? this.resolveMediaUrl(this.text(card.url as string, ctx)) : undefined,
      bodyText: card.bodyText ? this.text(card.bodyText as string, ctx) : undefined,
      ctaUrlButton: card.ctaUrlButton ? {
        ...card.ctaUrlButton,
        displayText: card.ctaUrlButton.displayText ? this.text(card.ctaUrlButton.displayText as string, ctx) : undefined,
        url: card.ctaUrlButton.url ? this.resolveMediaUrl(this.text(card.ctaUrlButton.url as string, ctx)) : undefined,
      } : undefined,
      quickReplyButtons: card.quickReplyButtons?.map((btn: any) => ({
        ...btn,
        title: btn.title ? this.text(btn.title as string, ctx) : undefined,
      })),
    }));

    const hasQuickReplies = (cards || []).some(card =>
      card.buttonType === 'quick_reply' && (card.quickReplyButtons?.length ?? 0) > 0
    );

    const interaction = node.data['interaction'] as any;

    if (hasQuickReplies && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction?.input?.timeoutSeconds ?? ctx.flow.settings.timeoutSeconds ?? 3600) as number) * 1000);

      const options = interaction?.input?.options ?? cards?.flatMap((card: any) =>
        card.buttonType === 'quick_reply' ? (card.quickReplyButtons || []).map((btn: any) => ({
          id: btn.id,
          label: btn.title,
          branchKey: btn.id
        })) : []
      ) ?? [];

      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { bodyText, cards } }],
        variableMutations: [], isTerminal: false,
        waitForInput: {
          type: 'choice',
          options,
          defaultBranchKey: interaction?.input?.defaultBranchKey,
          variableName: interaction?.input?.variableName,
          variableScope: interaction?.input?.variableScope,
          since,
          timeoutAt
        },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    if (hasQuickReplies && userInput !== undefined) {
      const options = interaction?.input?.options ?? cards?.flatMap((card: any) =>
        card.buttonType === 'quick_reply' ? (card.quickReplyButtons || []).map((btn: any) => ({
          id: btn.id,
          branchKey: btn.id
        })) : []
      ) ?? [];

      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction?.input?.defaultBranchKey ?? 'timeout';
      const mutations: VariableMutation[] = [];
      if (interaction?.input?.variableName) {
        const scope = (interaction.input.variableScope || 'session') as 'session' | 'contact';
        mutations.push({
          scope,
          key: interaction.input.variableName as string,
          value: userInput
        });
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

    return this.defaultResult(node, 'default', enteredAt, traverser, [
      { type: node.type, payload: { bodyText, cards } },
    ]);
  }

  private handleLanguageNode(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const { message, variable, variableName, variableScope, timeoutSeconds } = node.data as Record<string, any>;
    const resolvedMessage = this.text(message as string, ctx);

    // Use configured language options; prefer node list, fallback to flow localization list.
    const nodeLanguages = Array.isArray((node.data as Record<string, any>).languages)
      ? ((node.data as Record<string, any>).languages as string[])
      : [];

    const settings = ctx.flow.settings as Record<string, any>;
    const settingsLanguages = (settings?.localization?.isEnabled && Array.isArray(settings.localization.languages))
      ? settings.localization.languages
      : [];

    const languages = nodeLanguages.length > 0 ? nodeLanguages : settingsLanguages;

    const rawLanguageCodes: unknown[] = Array.isArray(languages) ? languages : [];

    const MAX_LANGUAGE_OPTIONS = 10;
    const languageCodes = Array.from(
      new Set(
        rawLanguageCodes
          .map((langCode) => String(langCode ?? '').trim())
          .filter((langCode) => langCode.length > 0),
      ),
    );
    const limitedLanguageCodes = languageCodes.slice(0, MAX_LANGUAGE_OPTIONS);

    if (languageCodes.length > MAX_LANGUAGE_OPTIONS) {
      logger.warn(
        {
          nodeId: node.id,
          flowId: ctx.flow.id,
          requestedLanguageCount: languageCodes.length,
          maxAllowed: MAX_LANGUAGE_OPTIONS,
        },
        'Language node has more than supported options for WhatsApp list; trimming to max allowed'
      );
    }

    const baseOptions = limitedLanguageCodes.map((langCode: string) => ({
      id: langCode,
      label: ISO_TO_NATIVE_NAME[langCode] || langCode.toUpperCase(),
      branchKey: 'default',
    }));
    const options = baseOptions;

    if (baseOptions.length === 0) {
      // No localization configured, just proceed silently or inform
      return this.defaultResult(node, 'default', enteredAt, traverser, [{ type: node.type, payload: { message: "No languages configured." } }]);
    }

    const langVar = variableName || variable || 'selected_language';
    const langScope = variableScope || 'session';

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + (timeoutSeconds || ctx.flow.settings.timeoutSeconds || 3600) * 1000);

      return {
        nextNodeId: node.id,
        outboundMessages: [{
          type: NodeType.SEND_LIST,
          payload: {
            body: resolvedMessage,
            buttonTitle: 'Choose language',
            sections: [{
              title: 'Languages',
              rows: options.map((option) => ({ id: option.id, title: option.label })),
            }],
          },
        }],
        variableMutations: [], isTerminal: false,
        waitForInput: { type: 'choice', options, variableName: langVar, variableScope: langScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    const result = this.defaultResult(node, 'default', enteredAt, traverser, [], [
      { scope: langScope as 'session' | 'contact', key: langVar, value: userInput },
    ]);
    return { ...result, historyStep: { ...result.historyStep, userInput }, languageChanged: userInput };
  }

  private async handleCondition(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser,
  ): Promise<NodeExecutionResult> {
    const expression = node.data['expression'];
    if (!expression) throw new FlowExecutionError('Condition node missing expression', node.id);
    const passed = await this.evaluator.evaluate(expression as any, ctx);
    return this.defaultResult(node, passed ? 'yes' : 'no', enteredAt, traverser);
  }



  private handleSetVariable(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser,
  ): NodeExecutionResult {
    const assignments = (node.data['assignments'] ?? []) as any[];
    const mutations: VariableMutation[] = assignments.map(a => {
      const strategy = (MUTATION_STRATEGIES[a.type] || MUTATION_STRATEGIES.value) as MutationStrategy;
      const value = strategy(a.value, a.systemVariable, ctx, this.resolver);

      return {
        scope: a.scope || 'session',
        key: a.variable,
        value: value,
      };
    });
    return this.defaultResult(node, 'default', enteredAt, traverser, [], mutations);
  }

  private handleRandomSplit(node: Node, enteredAt: Date, traverser: GraphTraverser): NodeExecutionResult {
    const branches = (node.data['branches'] ?? []) as Array<{ key: string; percentage: number }>;
    const rand = Math.random() * 100;
    let cumulative = 0;
    let selectedKey = branches[0]?.key ?? 'default';
    for (const branch of branches) {
      cumulative += branch.percentage;
      if (rand < cumulative) { selectedKey = branch.key; break; }
    }
    return this.defaultResult(node, selectedKey, enteredAt, traverser);
  }

  private handleLocationRequest(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const { message, variablePrefix } = node.data as Record<string, any>;
    const resolvedMessage = this.text(message as string, ctx);

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + (ctx.flow.settings.timeoutSeconds ?? 300) * 1000);
      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { message: resolvedMessage } }],
        variableMutations: [],
        isTerminal: false,
        waitForInput: { type: 'location', variableName: variablePrefix, variableScope: 'session' as const, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    try {
      const loc = JSON.parse(userInput);
      const prefix = variablePrefix || 'location';
      const mutations: VariableMutation[] = [
        { scope: 'session', key: `${prefix}_lat`, value: loc.latitude },
        { scope: 'session', key: `${prefix}_latitude`, value: loc.latitude },
        { scope: 'session', key: `${prefix}_lng`, value: loc.longitude },
        { scope: 'session', key: `${prefix}_longitude`, value: loc.longitude },
      ];
      if (loc.name) {
        mutations.push({ scope: 'session', key: `${prefix}_name`, value: loc.name });
      }
      if (loc.address) {
        mutations.push({ scope: 'session', key: `${prefix}_address`, value: loc.address });
      }

      const result = this.defaultResult(node, 'default', enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    } catch (e) {
      const result = this.defaultResult(node, 'default', enteredAt, traverser);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }
  }

  private handleMediaConditional(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const data = node.data as Record<string, any>;
    const variableKey = data.variable || data.variableName; // Support both for safety
    const variableScope = data.variableScope || 'session';
    const config = (data.config as any[]) || [];

    const resolvedMessage = this.text(data.message as string || "Please send the requested media.", ctx);
    const resolvedInvalidMessage = this.text(data.invalidMessage as string || "Invalid media type. Please try again.", ctx);

    // Initial trip through the node: show prompt and wait
    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + (data.timeoutSeconds || ctx.flow.settings.timeoutSeconds || 3600) * 1000);
      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: NodeType.SEND_TEXT, payload: { message: resolvedMessage } }],
        variableMutations: [],
        isTerminal: false,
        waitForInput: { type: 'media_conditional', variableName: variableKey, variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    // Processing actual user input
    let mediaType: string | undefined;
    let mediaValue: string | undefined;

    try {
      const parsed = JSON.parse(userInput);
      mediaType = parsed.type;
      mediaValue = parsed.value;
    } catch (e) {
      // If not JSON, check if text is an allowed type
      mediaType = 'text';
      mediaValue = userInput;
    }

    // Validate if the input type is allowed in the node's config
    const matched = config.find(c => c.type === mediaType);

    if (matched) {
      const branchKey = matched.branchKey || mediaType;
      const mutations: VariableMutation[] = [];
      if (variableKey) {
        mutations.push({
          scope: variableScope as 'session' | 'contact',
          key: variableKey,
          value: mediaValue!,
        });
      }

      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput: mediaValue } };
    } else {
      // INVALID INPUT: Stay on the same node, send invalid message, and wait again
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + (data.timeoutSeconds || ctx.flow.settings.timeoutSeconds || 3600) * 1000);
      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: NodeType.SEND_TEXT, payload: { message: resolvedInvalidMessage } }],
        variableMutations: [],
        isTerminal: false,
        waitForInput: { type: 'media_conditional', variableName: variableKey, variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }
  }

  private handleJumpToFlow(currentNode: Node, enteredAt: Date): NodeExecutionResult {
    return {
      nextNodeId: null,
      outboundMessages: [],
      variableMutations: [],
      isTerminal: true,
      jumpToFlowId: currentNode.data['targetFlowId'] as string,
      historyStep: {
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        enteredAt,
        exitedAt: new Date(),
        branchTaken: currentNode.data['targetFlowId'] as string,
      },
    };
  }

  private handleBotNode(currentNode: Node, enteredAt: Date, traverser: GraphTraverser): NodeExecutionResult {
    const nextNodeId = traverser.getNextNodeId(currentNode.id, 'default');
    return {
      nextNodeId: null,
      outboundMessages: [],
      variableMutations: [],
      isTerminal: true,
      jumpToFlowId: currentNode.data['targetFlowId'] as string,
      jumpToNodeId: currentNode.data['targetNodeId'] as string,
      returnNodeId: nextNodeId || undefined,
      historyStep: {
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        enteredAt,
        exitedAt: new Date(),
        branchTaken: currentNode.data['targetFlowId'] as string,
      },
    };
  }

  private handleWaitNode(node: Node, enteredAt: Date, traverser: GraphTraverser, userInput?: string): NodeExecutionResult {
    // If userInput is present (even as an empty string from a resume trigger), 
    // it means we have finished waiting and should move to the next node.
    if (userInput !== undefined) {
      return this.defaultResult(node, 'default', enteredAt, traverser);
    }

    const data = node.data as any;
    const duration = Number(data.duration) || 1;
    const unit = data.unit || 'minutes';

    let ms = 0;
    switch (unit) {
      case 'seconds': ms = duration * 1000; break;
      case 'minutes': ms = duration * 60 * 1000; break;
      case 'hours': ms = duration * 3600 * 1000; break;
      case 'days': ms = duration * 86400 * 1000; break;
      default: ms = duration * 60 * 1000;
    }

    const timeoutAt = new Date(enteredAt.getTime() + ms);

    return {
      nextNodeId: null, // Stay on this node while waiting
      outboundMessages: [],
      variableMutations: [],
      isTerminal: false,
      waitForInput: { type: 'wait', since: enteredAt, timeoutAt },
      historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
    };
  }
}
