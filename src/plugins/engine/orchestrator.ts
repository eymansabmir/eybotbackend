import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError, ValidationError } from '../../shared/errors';
import { SessionEntity } from '../../features/session/session.entity';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { ContactInfo, OrchestratorResult, OutboundMessage } from './engine.interface';
import { GraphTraverser } from './graph-traverser';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { NodeExecutor } from './node-executor';
import type { ElevenLabsNodeRequest, OpenAINodeRequest, VariableMutation } from './node-executor';

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
  executeElevenLabs?(input: ElevenLabsNodeExecutionInput): Promise<{ value: string; message: OutboundMessage }>;
  getTranslation?(language: string): Promise<any[] | null>;
}

export interface ElevenLabsNodeExecutionInput {
  orgId: string;
  flow: FlowEntity;
  session: SessionEntity;
  contact: ContactInfo;
  request: ElevenLabsNodeRequest;
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

    while (true) {
      if (stepCount >= MAX_LOOP_STEPS) {
        session.updateStatus('error');
        throw new FlowExecutionError(`Execution loop exceeded ${MAX_LOOP_STEPS} steps`, session.currentNodeId);
      }

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

      if (stepResult.languageChanged && runtime?.getTranslation) {
        const translatedNodes = await runtime.getTranslation(stepResult.languageChanged);
        if (translatedNodes) {
          traverser.updateNodes(translatedNodes as any);
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

        if (stepResult.openAIRequest.sendResponseToUser) {
          allMessages.push(openAIOutput.message);
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
          hasFallbackText: Boolean(request.fallbackText),
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
}
