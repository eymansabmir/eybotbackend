import type { Node } from '../../schemas/node.schema';
import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError } from '../../shared/errors';
import type { VariableContext } from './variable-resolver';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { GraphTraverser } from './graph-traverser';
import type { OutboundMessage } from './engine.interface';
import type { WaitingFor } from '../../features/session/session.entity';

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
  waitForInput?: WaitingFor;
  historyStep: HistoryStep;
  isTerminal: boolean;
}

export interface NodeExecutionInput {
  context: VariableContext;
  currentNode: Node;
  userInput?: string;
}

export interface OpenAINodeRequest {
  nodeId: string;
  mode: 'agent' | 'voice';
  voiceAction?: 'create_speech' | 'create_transcription';
  credentialId: string;
  model: string;
  voice?: string;
  prompt: string;
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

      case NodeType.SEND_TEMPLATE:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [{
          type: currentNode.type,
          payload: {
            templateName: currentNode.data['templateName'],
            languageCode: currentNode.data['languageCode'],
            components: currentNode.data['components'],
          },
        }]);

      case NodeType.SEND_CAROUSEL:
        return this.handleCarousel(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.ASK_QUESTION:
        return this.handleAskQuestion(currentNode, context, enteredAt, traverser, userInput);

      case NodeType.ASK_FILE:
        return this.handleAskFile(currentNode, context, enteredAt, traverser, userInput);
      case NodeType.NPS:
        return this.handleNps(currentNode, context, enteredAt, traverser, userInput);

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
      case NodeType.GOOGLE_SHEETS:
      case NodeType.NOCODB:
        return this.defaultResult(currentNode, 'default', enteredAt, traverser, [
          { type: currentNode.type, payload: currentNode.data as Record<string, unknown> },
        ]);

      case NodeType.SEND_CARDS:
        return this.handleCards(currentNode, context, enteredAt, traverser, userInput);
      case NodeType.OPENAI:
        return this.handleOpenAI(currentNode, context, enteredAt, traverser);

      case NodeType.ELEVENLABS:
        return this.handleElevenLabs(currentNode, context, enteredAt, traverser);


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

    const request: OpenAINodeRequest = {
      nodeId: node.id,
      mode: data['mode'] === 'voice' ? 'voice' : 'agent',
      ...(data['mode'] === 'voice'
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
    };

    return {
      ...base,
      openAIRequest: request,
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
    const resolvedMessage = this.text((message as string) || '', ctx);

    if (userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + (timeoutSeconds as number) * 1000);
      return {
        nextNodeId: node.id, outboundMessages: [{ type: node.type, payload: { message: resolvedMessage } }],
        variableMutations: [], isTerminal: false,
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
      bodyText: card.bodyText ? this.text(card.bodyText as string, ctx) : undefined,
    }));
    const interaction = node.data['interaction'] as any;

    if (interaction?.mode === 'input' && userInput === undefined) {
      const since = new Date();
      const timeoutAt = new Date(since.getTime() + ((interaction.input?.timeoutSeconds ?? 3600) as number) * 1000);
      
      // Collect all possible quick reply options across all cards
      const options = interaction.input?.options ?? cards?.flatMap((card: any) => 
        card.buttonType === 'quick_reply' ? (card.quickReplyButtons || []).map((btn: any) => ({
          id: btn.id,
          label: btn.title,
          branchKey: btn.id
        })) : []
      ) ?? [];

      return {
        nextNodeId: node.id,
        outboundMessages: [{ type: node.type, payload: { bodyText, cards: node.data['cards'] } }],
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
      { type: node.type, payload: { bodyText, cards: node.data['cards'] } },
    ]);
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
