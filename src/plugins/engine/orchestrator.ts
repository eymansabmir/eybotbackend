import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError, ValidationError } from '../../shared/errors';
import { SessionEntity } from '../../features/session/session.entity';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { ContactInfo, OrchestratorResult, OutboundMessage } from './engine.interface';
import { GraphTraverser } from './graph-traverser';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { NodeExecutor } from './node-executor';
import ivm from 'isolated-vm';
import type {
  ElevenLabsNodeRequest,
  HttpRequestNodeRequest,
  OpenAINodeRequest,
  GoogleSheetsNodeRequest,
  NocoDBNodeRequest,
  VariableMutation,
  AnthropicNodeRequest,
  DeepSeekNodeRequest,
  ScriptNodeRequest,
} from './node-executor';

const MAX_LOOP_STEPS = 50;

export interface OpenAINodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: OpenAINodeRequest;
}

export interface RuntimeIntegrations {
  executeOpenAI?(input: OpenAINodeExecutionInput): Promise<{ value: string; message: OutboundMessage; threadId?: string }>;
  executeAnthropic?(input: AnthropicNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  executeDeepSeek?(input: DeepSeekNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  executeElevenLabs?(input: ElevenLabsNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  getTranslation?(language: string): Promise<any[] | null>;
  getPreferredLanguage?(botId: string, waId: string): Promise<string | null>;
  setPreferredLanguage?(botId: string, waId: string, language: string): Promise<void>;
  executeHttpRequest?(input: HttpRequestNodeExecutionInput): Promise<{ mutations: VariableMutation[] }>;
  executeGoogleSheets?(input: GoogleSheetsNodeExecutionInput): Promise<{ mutations: VariableMutation[] }>;
  executeNocoDB?(input: NocoDBNodeExecutionInput): Promise<{ mutations: VariableMutation[] }>;
}

export interface DeepSeekNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: DeepSeekNodeRequest;
}

export interface ElevenLabsNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: ElevenLabsNodeRequest;
}

export interface AnthropicNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: AnthropicNodeRequest;
}

export interface HttpRequestNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: HttpRequestNodeRequest;
}

export interface GoogleSheetsNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: GoogleSheetsNodeRequest;
}

export interface NocoDBNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: NocoDBNodeRequest;
}

/**
 * Flow orchestrator with optional runtime integration hooks.
 * The engine remains the owner of graph traversal while integration handlers
 * can execute side effects for integration nodes (OpenAI, etc.).
 */
export class FlowOrchestrator {
  private readonly resolver = new VariableResolver();
  private readonly evaluator = new ConditionEvaluator(this.resolver);
  private readonly executor = new NodeExecutor(this.resolver, this.evaluator);

  async startFlow(
    flow: FlowEntity,
    contact: ContactInfo,
    initialVariables: Record<string, unknown>,
    flowId: string,
    waId: string,
    waBusinessNumber: string,
    runtime?: RuntimeIntegrations,
  ): Promise<OrchestratorResult> {
    if (flow.status !== 'published') {
      throw new ValidationError(`Flow '${flowId}' is not published`);
    }

    const startNode = flow.nodes.find((n) => n.type === NodeType.START);
    if (!startNode) {
      throw new FlowExecutionError('Flow has no START node', flowId);
    }

    const session = new SessionEntity({
      flowId,
      flowVersion: flow.version,
      waId,
      waBusinessNumber,
      status: 'active',
      currentNodeId: startNode.id,
      variables: initialVariables,
      history: [],
      isCurrent: true,
    });

    return this.runLoop(session, contact, flow, undefined, runtime);
  }

  async resumeFlow(
    flow: FlowEntity,
    contact: ContactInfo,
    session: SessionEntity,
    userInput: string,
    runtime?: RuntimeIntegrations,
  ): Promise<OrchestratorResult> {
    if (session.status === 'completed' || session.status === 'timed_out') {
      throw new ValidationError(`Session '${session.id}' is already ${session.status}`);
    }
    if (session.status === 'error') {
      throw new ValidationError(`Session '${session.id}' is in error state`);
    }

    session.clearWaitingFor();
    session.isCurrent = true;

    return this.runLoop(session, contact, flow, userInput, runtime);
  }

  private async runLoop(
    session: SessionEntity,
    contact: ContactInfo,
    flow: FlowEntity,
    userInput: string | undefined,
    runtime?: RuntimeIntegrations,
  ): Promise<OrchestratorResult> {
    const traverser = new GraphTraverser(flow.nodes, flow.edges);
    const allMessages: OutboundMessage[] = [];
    const allContactMutations: Record<string, unknown> = {};
    let stepCount = 0;
    let isFirstStep = true;

    // --- TOP-LEVEL LANGUAGE RESOLUTION ---
    // Check DB preference FIRST to prevent English flickering in step 0
    let detectedLang: string | undefined;

    // Find the primary language node to check its skip logic
    const primaryLangNode = flow.nodes.find((n) => n.type === NodeType.LANGUAGE);
    const globalSkipEnabled = !!(primaryLangNode?.data as any)?.skipIfAlreadySelected;

    if (globalSkipEnabled) {
      if (runtime?.getPreferredLanguage) {
        console.log(`[Orchestrator] Step 0: Checking DB for persistent preference (Skip is ON)...`);
        const dbPref = await runtime.getPreferredLanguage(flow.id!, session.waId);
        if (dbPref) {
          console.log(`[Orchestrator] Step 0: Found DB preference '${dbPref}'. Using as primary.`);
          detectedLang = dbPref;
        }
      }

      // Fallback to session/contact if DB was empty
      if (!detectedLang) {
        const langKeys = ['selected_language', 'user_lang'];
        for (const key of langKeys) {
          detectedLang = (session.variables[key] as string) || (contact.customFields[key] as string);
          if (detectedLang) {
            console.log(`[Orchestrator] Step 0: Found preference in variables: '${detectedLang}' (key: ${key})`);
            break;
          }
        }
      }

      if (detectedLang && runtime?.getTranslation) {
        console.log(`[Orchestrator] Step 0: Loading translations for '${detectedLang}'...`);
        try {
          const translations = await runtime.getTranslation(detectedLang);
          if (translations && Array.isArray(translations)) {
            console.log(`[Orchestrator] Step 0: Successfully applied translations. Journey will start in '${detectedLang}'.`);
            traverser.updateNodes(translations as any);
          }
        } catch (err) {
          console.error(`[Orchestrator] Step 0: Error loading translations:`, err);
        }
      }
    } else {
      console.log(`[Orchestrator] Step 0: Skip logic is OFF or no Language node found. Journey will start in default language.`);
    }
    // ------------------------------------

    while (stepCount < MAX_LOOP_STEPS) {

      const currentNode = traverser.getNode(session.currentNodeId);
      console.log(`[Orchestrator] [Step ${stepCount}] Processing ${currentNode.type} node: ${currentNode.id}`);

      // --- STRICT LANGUAGE SKIP LOGIC ---
      if (currentNode.type === NodeType.LANGUAGE && runtime?.getPreferredLanguage) {
        const nodeData = (currentNode.data as any) || {};
        const skipEnabledRaw = nodeData.skipIfAlreadySelected;
        const skipEnabled = !!skipEnabledRaw;
        const preferenceInDB = detectedLang || await runtime.getPreferredLanguage(flow.id!, session.waId);

        // Rule 1: database has a valid pref lang + skip toggle on -> SKIP
        if (preferenceInDB && skipEnabled) {

          const varName = nodeData.variableName || nodeData.variable || 'selected_language';
          const varScope = nodeData.variableScope || 'session';

          this.applyMutation({
            scope: varScope as any,
            key: varName,
            value: preferenceInDB
          }, session, contact, allContactMutations);

          if (runtime?.getTranslation && preferenceInDB !== detectedLang) {
            const translations = await runtime.getTranslation(preferenceInDB);
            if (translations) traverser.updateNodes(translations as any);
          }

          // Execute skip
          const skipInput = { context: { session, contact, flow }, currentNode, userInput: preferenceInDB };
          const skipResult = this.executor.execute(skipInput, traverser);

          stepCount++;
          session.addToHistory(skipResult.historyStep);
          if (skipResult.nextNodeId) {
            session.moveToNode(skipResult.nextNodeId);
            continue;
          }
        } else {
          // Rule 2 & 3: Skip OFF or No Preference -> PROMPT
        }
      }
      // -------------------------------------

      const execInput = isFirstStep && userInput !== undefined
        ? { context: { session, contact, flow }, currentNode, userInput }
        : { context: { session, contact, flow }, currentNode };

      console.log(`[Orchestrator] Step ${stepCount}: Executing ${currentNode.type} (${currentNode.id}). Input: '${(execInput as any).userInput ?? 'undefined'}'`);

      const stepResult = this.executor.execute(execInput, traverser);

      console.log(`[Orchestrator] Step ${stepCount}: Execution finished. Messages sent: ${stepResult.outboundMessages.length}, Next Node: ${stepResult.nextNodeId}`);

      isFirstStep = false;
      stepCount++;

      allMessages.push(...stepResult.outboundMessages);

      for (const m of stepResult.variableMutations) {
        this.applyMutation(m, session, contact, allContactMutations);
        logger.debug({ scope: m.scope, key: m.key, value: m.value }, '[Orchestrator] Applied variable mutation');
      }
      if (stepResult.variableMutations.length > 0) {
        logger.debug({ sessionVars: session.variables }, '[Orchestrator] Session variables after mutations');
      }

      if (stepResult.languageChanged) {
        console.log(`[Orchestrator] Language changed to '${stepResult.languageChanged}'. Updating traverser and saving preference.`);
        if (runtime?.getTranslation) {
          const translatedNodes = await runtime.getTranslation(stepResult.languageChanged);
          if (translatedNodes) {
            console.log(`[Orchestrator] Applying fetched translations for '${stepResult.languageChanged}'.`);
            traverser.updateNodes(translatedNodes as any);
          }
        }

        // PERSIST LOGIC
        if (runtime?.setPreferredLanguage) {
          await runtime.setPreferredLanguage(flow.id!, session.waId, stepResult.languageChanged);
        }
      }

      if (stepResult.openAIRequest) {
        const openAIOutput = await this.executeOpenAIRequest(
          flow,
          session,
          contact,
          stepResult.openAIRequest,
          runtime,
        );

        this.applyMutation({
          scope: stepResult.openAIRequest.resultScope,
          key: stepResult.openAIRequest.resultVariable,
          value: openAIOutput.value,
        }, session, contact, allContactMutations);

        if (
          stepResult.openAIRequest.mode === 'assistant' &&
          openAIOutput.threadId &&
          stepResult.openAIRequest.threadIdStorage
        ) {
          this.applyMutation({
            scope: stepResult.openAIRequest.threadIdStorage.scope,
            key: stepResult.openAIRequest.threadIdStorage.key,
            value: openAIOutput.threadId,
          }, session, contact, allContactMutations);
        }

        if (stepResult.openAIRequest.sendResponseToUser) {
          allMessages.push(openAIOutput.message);
        }
      }

      if (stepResult.anthropicRequest) {
        const anthropicOutput = await this.executeAnthropicRequest(
          flow,
          session,
          contact,
          stepResult.anthropicRequest,
          runtime,
        );

        this.applyMutation({
          scope: stepResult.anthropicRequest.resultScope,
          key: stepResult.anthropicRequest.resultVariable,
          value: anthropicOutput.value,
        }, session, contact, allContactMutations);

        if (stepResult.anthropicRequest.sendResponseToUser) {
          allMessages.push(anthropicOutput.message);
        }
      }

      if (stepResult.deepSeekRequest) {
        const deepSeekOutput = await this.executeDeepSeekRequest(
          flow,
          session,
          contact,
          stepResult.deepSeekRequest,
          runtime,
        );

        this.applyMutation({
          scope: stepResult.deepSeekRequest.resultScope,
          key: stepResult.deepSeekRequest.resultVariable,
          value: deepSeekOutput.value,
        }, session, contact, allContactMutations);

        if (stepResult.deepSeekRequest.sendResponseToUser) {
          allMessages.push(deepSeekOutput.message);
        }
      }

      if (stepResult.elevenLabsRequest) {
        const elevenLabsOutput = await this.executeElevenLabsRequest(
          flow,
          session,
          contact,
          stepResult.elevenLabsRequest,
          runtime,
        );

        this.applyMutation({
          scope: stepResult.elevenLabsRequest.resultScope,
          key: stepResult.elevenLabsRequest.resultVariable,
          value: elevenLabsOutput.value,
        }, session, contact, allContactMutations);

        if (stepResult.elevenLabsRequest.sendResponseToUser) {
          allMessages.push(elevenLabsOutput.message);
        }
      }

      if (stepResult.httpRequest) {
        const httpRequestOutput = await this.executeHttpRequest(
          flow,
          session,
          contact,
          stepResult.httpRequest,
          runtime,
        );

        for (const mutation of httpRequestOutput.mutations) {
          this.applyMutation(mutation, session, contact, allContactMutations);
        }
      }

      if (stepResult.googleSheetsRequest) {
        const output = await this.executeGoogleSheetsRequest(
          flow,
          session,
          contact,
          stepResult.googleSheetsRequest,
          runtime,
        );

        for (const mutation of output.mutations) {
          this.applyMutation(mutation, session, contact, allContactMutations);
        }
      }

      if (stepResult.nocoDBRequest) {
        const output = await this.executeNocoDBRequest(
          flow,
          session,
          contact,
          stepResult.nocoDBRequest,
          runtime,
        );

        for (const mutation of output.mutations) {
          this.applyMutation(mutation, session, contact, allContactMutations);
        }
      }

      if (stepResult.scriptRequest) {
        const output = await this.executeScriptRequest(
          flow,
          session,
          contact,
          stepResult.scriptRequest,
          runtime,
        );

        for (const mutation of output.mutations) {
          this.applyMutation(mutation, session, contact, allContactMutations);
        }
      }

      if (stepResult.returnMark) {
        session.returnMark = stepResult.returnMark;
        logger.debug({ returnMark: session.returnMark }, '[Orchestrator] Set return mark');
      }

      if (currentNode.type === NodeType.RETURN) {
        session.returnMark = undefined;
        logger.debug('[Orchestrator] Cleared return mark after RETURN node execution');
      }

      session.addToHistory(stepResult.historyStep);

      if (stepResult.nextNodeId) {
        session.moveToNode(stepResult.nextNodeId);
      }

      if (stepResult.waitForInput) {
        session.setWaitingFor(stepResult.waitForInput);
        if (stepResult.nextNodeId) {
          session.moveToNode(stepResult.nextNodeId);
        }
        return {
          session,
          outboundMessages: allMessages,
          isFinished: false,
          waitingFor: stepResult.waitForInput,
          contactMutations: allContactMutations,
        };
      }

      if (stepResult.isTerminal || stepResult.nextNodeId === null) {
        session.updateStatus('completed');
        session.isCurrent = false;
        return {
          session,
          outboundMessages: allMessages,
          isFinished: true,
          contactMutations: allContactMutations,
        };
      }
    }

    session.updateStatus('error');
    throw new FlowExecutionError(`Execution loop exceeded ${MAX_LOOP_STEPS} steps`, session.currentNodeId);
  }

  private async executeOpenAIRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: OpenAINodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ value: string; message: OutboundMessage; threadId?: string }> {
    try {
      if (!runtime?.executeOpenAI) {
        throw new FlowExecutionError('OpenAI runtime executor is not configured', request.nodeId);
      }

      logger.info(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          model: request.model,
          mode: request.mode,
          imageSize: request.imageSize,
          imageQuality: request.imageQuality,
          hasFallbackText: !!request.fallbackText,
          action: 'runtime.executeOpenAI',
        },
        'STEP 5: Executing OpenAI runtime request',
      );

      const response = await runtime.executeOpenAI({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });

      if (!response.value.trim()) {
        throw new FlowExecutionError('OpenAI runtime returned empty response', request.nodeId);
      }

      logger.info(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          outputType: response.message.type,
          outputChars: response.value.length,
          action: 'runtime.executeOpenAI',
        },
        'STEP 6: OpenAI runtime response received',
      );

      return response;
    } catch (error) {
      logger.warn(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          action: 'runtime.executeOpenAI',
          error: error instanceof Error ? error.message : String(error),
        },
        'OpenAI runtime execution failed in orchestrator',
      );

      if (request.fallbackText) {
        return {
          value: request.fallbackText,
          message: {
            type: NodeType.SEND_TEXT,
            payload: { message: request.fallbackText },
          },
        };
      }
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('OpenAI runtime execution failed', request.nodeId);
    }
  }

  private applyMutation(
    mutation: VariableMutation,
    session: SessionEntity,
    contact: ContactInfo,
    contactMutations: Record<string, unknown>,
  ): void {
    if (mutation.scope === 'session') {
      session.setVariable(mutation.key, mutation.value);
    } else {
      contact.customFields[mutation.key] = mutation.value;
      contactMutations[mutation.key] = mutation.value;
    }
  }

  private async executeAnthropicRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: AnthropicNodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ value: string; message: OutboundMessage }> {
    try {
      if (!runtime?.executeAnthropic) {
        throw new FlowExecutionError('Anthropic runtime executor is not configured', request.nodeId);
      }

      logger.info(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          model: request.model,
          mode: request.mode,
          action: 'runtime.executeAnthropic',
        },
        'STEP 5: Executing Anthropic runtime request',
      );

      const response = await runtime.executeAnthropic({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });

      if (!response.value.trim()) {
        throw new FlowExecutionError('Anthropic runtime returned empty response', request.nodeId);
      }

      logger.info(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          outputType: response.message.type,
          outputChars: response.value.length,
          action: 'runtime.executeAnthropic',
        },
        'STEP 6: Anthropic runtime response received',
      );

      return response;
    } catch (error) {
      logger.warn(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          action: 'runtime.executeAnthropic',
          error: error instanceof Error ? error.message : String(error),
        },
        'Anthropic runtime execution failed in orchestrator',
      );

      if (request.fallbackText) {
        return {
          value: request.fallbackText,
          message: {
            type: NodeType.SEND_TEXT,
            payload: { message: request.fallbackText },
          },
        };
      }
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('Anthropic runtime execution failed', request.nodeId);
    }
  }

  private async executeDeepSeekRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: DeepSeekNodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ value: string; message: OutboundMessage }> {
    try {
      if (!runtime?.executeDeepSeek) {
        throw new FlowExecutionError('DeepSeek runtime executor is not configured', request.nodeId);
      }

      logger.info(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          model: request.model,
          mode: request.mode,
          action: 'runtime.executeDeepSeek',
        },
        'STEP 5: Executing DeepSeek runtime request',
      );

      const response = await runtime.executeDeepSeek({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });

      if (!response.value.trim()) {
        throw new FlowExecutionError('DeepSeek runtime returned empty response', request.nodeId);
      }

      logger.info(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          outputType: response.message.type,
          outputChars: response.value.length,
          action: 'runtime.executeDeepSeek',
        },
        'STEP 6: DeepSeek runtime response received',
      );

      return response;
    } catch (error) {
      logger.warn(
        {
          orgId: flow.orgId,
          flowId: flow.id,
          sessionId: session.id,
          nodeId: request.nodeId,
          action: 'runtime.executeDeepSeek',
          error: error instanceof Error ? error.message : String(error),
        },
        'DeepSeek runtime execution failed in orchestrator',
      );

      if (request.fallbackText) {
        return {
          value: request.fallbackText,
          message: {
            type: NodeType.SEND_TEXT,
            payload: { message: request.fallbackText },
          },
        };
      }
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('DeepSeek runtime execution failed', request.nodeId);
    }
  }

  private async executeElevenLabsRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: ElevenLabsNodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ value: string; message: OutboundMessage }> {
    try {
      if (!runtime?.executeElevenLabs) {
        throw new FlowExecutionError('ElevenLabs runtime executor is not configured', request.nodeId);
      }

      const response = await runtime.executeElevenLabs({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });

      if (!response.value.trim()) {
        throw new FlowExecutionError('ElevenLabs runtime returned empty response', request.nodeId);
      }
      return response;
    } catch (error) {
      if (request.fallbackText) {
        return {
          value: request.fallbackText,
          message: {
            type: NodeType.SEND_TEXT,
            payload: { message: request.fallbackText },
          },
        };
      }
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('ElevenLabs runtime execution failed', request.nodeId);
    }
  }

  private async executeHttpRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: HttpRequestNodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ mutations: VariableMutation[] }> {
    try {
      if (!runtime?.executeHttpRequest) {
        throw new FlowExecutionError('HTTP request runtime executor is not configured', request.nodeId);
      }

      return await runtime.executeHttpRequest({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });
    } catch (error) {
      if (request.fallbackText) {
        logger.warn(
          {
            orgId: flow.orgId,
            flowId: flow.id,
            sessionId: session.id,
            nodeId: request.nodeId,
            message: error instanceof Error ? error.message : String(error),
            action: 'runtime.executeHttpRequest',
          },
          'HTTP request failed; continuing flow because fallback text is configured',
        );

        return { mutations: [] };
      }

      throw new FlowExecutionError(error instanceof Error ? error.message : 'HTTP request execution failed', request.nodeId);
    }
  }

  private async executeScriptRequest(
    _flow: FlowEntity,
    session: SessionEntity,
    _contact: ContactInfo,
    request: ScriptNodeRequest,
    _runtime?: RuntimeIntegrations,
  ): Promise<{ mutations: VariableMutation[] }> {
    const isolate = new ivm.Isolate({ memoryLimit: 128 });
    const context = isolate.createContextSync();
    const global = context.global;
    global.setSync('global', global.derefInto());

    const variableMutations: VariableMutation[] = [];
    const variablesObj = { ...session.variables };
    global.setSync('variables', new ivm.Reference(variablesObj));

    context.evalClosureSync(
      `globalThis.variables = new Proxy($0.copySync(), {
        set: function(target, prop, value) {
          target[prop] = value;
          $1.applySync(undefined, [prop, value]);
          return true;
        }
      });`,
      [
        new ivm.Reference(variablesObj),
        new ivm.Reference((key: string, value: any) => {
          variableMutations.push({
            scope: 'session',
            key,
            value,
          });
        })
      ]
    );

    context.evalClosureSync(
      `globalThis.fetch = async (...args) => {
        const result = await $0.apply(undefined, args, { arguments: { copy: true }, promise: true, result: { copy: true, promise: true } });
        return {
          ok: result.ok,
          status: result.status,
          statusText: result.statusText,
          text: async () => result.text,
          json: async () => JSON.parse(result.text),
        };
      }`,
      [
        new ivm.Reference(async (...args: any[]) => {
          const response = await fetch(args[0], args[1]);
          const text = await response.text();
          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            text,
          };
        }),
      ]
    );

    try {
      await context.evalClosure(
        `return (async function() {
          const AsyncFunction = async function () {}.constructor;
          return new AsyncFunction($0)();
        }())`,
        [request.code],
        { result: { copy: true, promise: true }, timeout: 5000 }
      );
      return { mutations: variableMutations };
    } catch (err) {
      console.error(`[Orchestrator] Error executing script in node ${request.nodeId}:`, err);
      return { mutations: variableMutations };
    } finally {
      context.release();
      isolate.dispose();
    }
  }

  private async executeGoogleSheetsRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: GoogleSheetsNodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ mutations: VariableMutation[] }> {
    try {
      if (!runtime?.executeGoogleSheets) {
        throw new FlowExecutionError('Google Sheets runtime executor is not configured', request.nodeId);
      }

      return await runtime.executeGoogleSheets({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('Google Sheets runtime execution failed', request.nodeId);
    }
  }

  private async executeNocoDBRequest(
    flow: FlowEntity,
    session: SessionEntity,
    contact: ContactInfo,
    request: NocoDBNodeRequest,
    runtime?: RuntimeIntegrations,
  ): Promise<{ mutations: VariableMutation[] }> {
    try {
      if (!runtime?.executeNocoDB) {
        throw new FlowExecutionError('NocoDB runtime executor is not configured', request.nodeId);
      }

      return await runtime.executeNocoDB({
        orgId: flow.orgId,
        flow,
        session,
        contact,
        request,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('NocoDB runtime execution failed', request.nodeId);
    }
  }
}
