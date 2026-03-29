import type { Node } from '../../schemas/node.schema';
import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError } from '../../shared/errors';
import type { VariableContext } from './variable-resolver';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { GraphTraverser } from './graph-traverser';
import type { OutboundMessage } from './engine.interface';
import type { WaitingFor } from '../../features/session/session.entity';
import { ISO_TO_NATIVE_NAME } from '@plugins/i18n/languages';

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
  waitForInput?: WaitingFor;
  historyStep: HistoryStep;
  isTerminal: boolean;
  languageChanged?: string;
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
]);

export class NodeExecutor {
  constructor(
    private readonly resolver: VariableResolver,
    private readonly evaluator: ConditionEvaluator,
  ) { }

  isLogicNode(type: NodeType): boolean {
    return LOGIC_TYPES.has(type);
  }

  execute(input: NodeExecutionInput, traverser: GraphTraverser): NodeExecutionResult {
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
          { type: currentNode.type, payload: { message: this.text(currentNode.data['message'] as string, context) } },
        ]);

      case NodeType.SEND_IMAGE:
      case NodeType.SEND_VIDEO:
      case NodeType.SEND_AUDIO:
      case NodeType.SEND_DOCUMENT:
      case NodeType.SEND_STICKER:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            url: currentNode.data['url'] ? this.text(currentNode.data['url'] as string, context) : undefined,
            mediaId: currentNode.data['mediaId'] ? this.text(currentNode.data['mediaId'] as string, context) : undefined,
            ...(currentNode.data['caption'] ? { caption: this.text(currentNode.data['caption'] as string, context) } : {}),
            ...(currentNode.data['filename'] ? { filename: currentNode.data['filename'] } : {}),
          },
        }]);

      case NodeType.SEND_LOCATION:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            latitude: currentNode.data['latitude'],
            longitude: currentNode.data['longitude'],
            name: currentNode.data['name'],
            address: currentNode.data['address'],
          },
        }]);

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

      case NodeType.ASK_QUESTION:
        return this.handleAskQuestion(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.ASK_FILE:
        return this.handleAskFile(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.NPS:
        return this.handleNps(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.LANGUAGE:
        return this.handleLanguageNode(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.CONDITION:
        return this.handleCondition(currentNode, context, enteredAt, traverser);

      case NodeType.SET_VARIABLE:
        return this.handleSetVariable(currentNode, context, enteredAt, traverser);

      case NodeType.RANDOM_SPLIT:
        return this.handleRandomSplit(currentNode, enteredAt, traverser);

      case NodeType.JUMP_TO_FLOW:
        return {
          nextNodeId: null, outboundMessages: [], variableMutations: [], isTerminal: true,
          historyStep: { nodeId: currentNode.id, nodeType: currentNode.type, enteredAt, exitedAt: new Date(), branchTaken: currentNode.data['targetFlowId'] as string },
        };

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
      ...(typeof data['audioUrl'] === 'string' ? { audioUrl: this.text(data['audioUrl'], ctx) } : {}),
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
      ...(typeof data['threadId'] === 'string' ? { threadId: data['threadId'] } : {}),
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
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? 300) as number) * 1000);
      
      const options = items.flatMap((item: any) => 
        (item.buttons ?? []).map((b: any) => ({ id: b.id, label: b.text, branchKey: b.branchKey }))
      );

      const messages: OutboundMessage[] = items.map((item: any) => ({
        type: node.type,
        payload: {
          imageUrl: item.imageUrl ? this.text(item.imageUrl, ctx) : undefined,
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
      if (interaction.input?.variableName && interaction.input?.variableScope) {
        mutations.push({ scope: interaction.input.variableScope as 'session' | 'contact', key: interaction.input.variableName as string, value: userInput });
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

    const messages: OutboundMessage[] = items.map((item: any) => ({
      type: node.type,
      payload: {
        imageUrl: item.imageUrl ? this.text(item.imageUrl, ctx) : undefined,
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
      const timeoutAt = new Date(since.getTime() + (timeoutSeconds as number) * 1000);
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
      const timeoutAt = new Date(since.getTime() + (timeoutSeconds as number) * 1000);
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
      const timeoutAt = new Date(since.getTime() + ((timeoutSeconds ?? 300) as number) * 1000);
      
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

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? 300) as number) * 1000);
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
      const options = interaction.input?.options ?? (node.data['buttons'] as any[])?.map((b: any) => ({ id: b.id, branchKey: b.id })) ?? [];
      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction.input?.defaultBranchKey ?? 'default';
      const mutations: VariableMutation[] = [];
      if (interaction.input?.variableName && interaction.input?.variableScope) {
        mutations.push({ scope: interaction.input.variableScope as 'session' | 'contact', key: interaction.input.variableName as string, value: userInput });
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

    return this.defaultResult(node, 'default', enteredAt, traverser, [
      { type: node.type, payload: { body, footer, buttons: node.data['buttons'] } },
    ]);
  }

  private handleList(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser, userInput?: string,
  ): NodeExecutionResult {
    const body = this.text(node.data['body'] as string, ctx);
    const interaction = node.data['interaction'] as any;

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? 300) as number) * 1000);
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
      const options = interaction.input?.options ?? (node.data['sections'] as any[])?.flatMap((s: any) => s.rows?.map((r: any) => ({ id: r.id, branchKey: r.id }))) ?? [];
      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction.input?.defaultBranchKey ?? 'default';
      const mutations: VariableMutation[] = [];
      if (interaction.input?.variableName && interaction.input?.variableScope) {
        mutations.push({ scope: interaction.input.variableScope as 'session' | 'contact', key: interaction.input.variableName as string, value: userInput });
      }
      const result = this.defaultResult(node, branchKey, enteredAt, traverser, [], mutations);
      return { ...result, historyStep: { ...result.historyStep, userInput } };
    }

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
      url: card.url ? this.text(card.url as string, ctx) : undefined,
      bodyText: card.bodyText ? this.text(card.bodyText as string, ctx) : undefined,
      ctaUrlButton: card.ctaUrlButton ? {
        ...card.ctaUrlButton,
        displayText: card.ctaUrlButton.displayText ? this.text(card.ctaUrlButton.displayText as string, ctx) : undefined,
        url: card.ctaUrlButton.url ? this.text(card.ctaUrlButton.url as string, ctx) : undefined,
      } : undefined,
      quickReplyButtons: card.quickReplyButtons?.map((btn: any) => ({
        ...btn,
        title: btn.title ? this.text(btn.title as string, ctx) : undefined,
      })),
    }));
    const interaction = node.data['interaction'] as any;

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? 3600) as number) * 1000);
      
      const options = interaction.input?.options ?? cards?.flatMap((card: any) => 
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
        waitForInput: { type: 'choice', options, defaultBranchKey: interaction.input?.defaultBranchKey, variableName: interaction.input?.variableName, variableScope: interaction.input?.variableScope, since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    if (interaction?.mode === 'input' && userInput !== undefined) {
      const options = interaction.input?.options ?? cards?.flatMap((card: any) => 
        card.buttonType === 'quick_reply' ? (card.quickReplyButtons || []).map((btn: any) => ({
          id: btn.id,
          branchKey: btn.id
        })) : []
      ) ?? [];

      const selected = (options as any[]).find((o: any) => o.id === userInput);
      const branchKey = selected?.branchKey ?? interaction.input?.defaultBranchKey ?? 'timeout';
      const mutations: VariableMutation[] = [];
      if (interaction.input?.variableName && interaction.input?.variableScope) {
        mutations.push({ scope: interaction.input.variableScope as 'session' | 'contact', key: interaction.input.variableName as string, value: userInput });
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
    const { message, variable, timeoutSeconds } = node.data as Record<string, any>;
    const resolvedMessage = this.text(message as string, ctx);
    
    // Fetch languages from flow settings
    const settings = ctx.flow.settings as Record<string, any>;
    const languages = (settings?.localization?.isEnabled && Array.isArray(settings.localization.languages)) 
        ? settings.localization.languages 
        : [];

    if (languages.length === 0) {
        // No localization configured, just proceed silently or inform
        return this.defaultResult(node, 'default', enteredAt, traverser, [{ type: node.type, payload: { message: "No languages configured." } }]);
    }

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + (timeoutSeconds || 3600) * 1000);
      
      const options = languages.map((langCode: string) => ({
          id: langCode,
          label: ISO_TO_NATIVE_NAME[langCode] || langCode.toUpperCase(),
          branchKey: 'default'
      }));

      // Map to interactive buttons or list if length > 3
      const isList = languages.length > 3;
      const payload = isList 
          ? { body: resolvedMessage, buttonTitle: "Select Language", sections: [{ title: "Languages", rows: options.map((o: any) => ({ id: o.id, title: o.label })) }] }
          : { body: resolvedMessage, buttons: options.map((o: any) => ({ id: o.id, title: o.label })) };
      const outType = isList ? NodeType.SEND_LIST : NodeType.SEND_BUTTONS;

      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: outType as NodeType, payload }],
        variableMutations: [], isTerminal: false,
        waitForInput: { type: 'choice', options, variableName: variable || 'selected_language', variableScope: 'session', since, timeoutAt },
        historyStep: { nodeId: node.id, nodeType: node.type, enteredAt },
      };
    }

    const langVar = variable || 'selected_language';
    const result = this.defaultResult(node, 'default', enteredAt, traverser, [], [
      { scope: 'session', key: langVar, value: userInput },
    ]);
    return { ...result, historyStep: { ...result.historyStep, userInput }, languageChanged: userInput };
  }

  private handleCondition(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser,
  ): NodeExecutionResult {
    const expression = node.data['expression'];
    if (!expression) throw new FlowExecutionError('Condition node missing expression', node.id);
    const passed = this.evaluator.evaluate(expression as any, ctx);
    return this.defaultResult(node, passed ? 'yes' : 'no', enteredAt, traverser);
  }

  private handleSetVariable(
    node: Node, ctx: VariableContext, enteredAt: Date, traverser: GraphTraverser,
  ): NodeExecutionResult {
    const assignments = (node.data['assignments'] ?? []) as Array<{ variable: string; value: string; scope: 'session' | 'contact' }>;
    const mutations: VariableMutation[] = assignments.map(a => ({
      scope: a.scope,
      key: a.variable,
      value: this.text(a.value, ctx),
    }));
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
}
