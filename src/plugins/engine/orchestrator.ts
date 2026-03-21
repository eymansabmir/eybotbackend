import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError, ValidationError } from '../../shared/errors';
import { SessionEntity } from '../../features/session/session.entity';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { ContactInfo, OrchestratorResult, OutboundMessage } from './engine.interface';
import { GraphTraverser } from './graph-traverser';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { NodeExecutor } from './node-executor';
import type {
  ElevenLabsNodeRequest,
  HttpRequestNodeRequest,
  OpenAINodeRequest,
  GoogleSheetsNodeRequest,
  NocoDBNodeRequest,
  VariableMutation,
  AnthropicNodeRequest,
  DeepSeekNodeRequest,
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
  executeOpenAI?(input: OpenAINodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  executeAnthropic?(input: AnthropicNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  executeDeepSeek?(input: DeepSeekNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  executeElevenLabs?(input: ElevenLabsNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
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

    while (stepCount < MAX_LOOP_STEPS) {

      const currentNode = traverser.getNode(session.currentNodeId);
      const execInput = isFirstStep && userInput !== undefined
        ? { context: { session, contact, flow }, currentNode, userInput }
        : { context: { session, contact, flow }, currentNode };

      const stepResult = this.executor.execute(execInput, traverser);
      isFirstStep = false;
      stepCount++;

      allMessages.push(...stepResult.outboundMessages);

      for (const m of stepResult.variableMutations) {
        this.applyMutation(m, session, contact, allContactMutations);
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
  ): Promise<{ value: string; message: OutboundMessage }> {
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
      if (error instanceof Error) {
        throw new FlowExecutionError(error.message, request.nodeId);
      }
      throw new FlowExecutionError('HTTP request runtime execution failed', request.nodeId);
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
