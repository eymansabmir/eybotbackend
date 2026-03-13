import { NodeType } from '../../schemas/node-types.enum';
import { FlowExecutionError, ValidationError } from '../../shared/errors';
import { SessionEntity } from '../../features/session/session.entity';
import type { FlowEntity } from '../../features/flow/flow.entity';
import type { ContactInfo, OrchestratorResult, OutboundMessage } from './engine.interface';
import { GraphTraverser } from './graph-traverser';
import { VariableResolver } from './variable-resolver';
import { ConditionEvaluator } from './condition-evaluator';
import { NodeExecutor } from './node-executor';
import type { VariableMutation } from './node-executor';

const MAX_LOOP_STEPS = 50;

/**
 * Pure-computation orchestrator.
 * Receives entities, runs the flow execution loop entirely in memory,
 * and returns the resulting session state + messages + contact mutations.
 * No repository or I/O calls happen here.
 */
export class FlowOrchestrator {
  private readonly resolver = new VariableResolver();
  private readonly evaluator = new ConditionEvaluator(this.resolver);
  private readonly executor = new NodeExecutor(this.resolver, this.evaluator);

  startFlow(
    flow: FlowEntity,
    contact: ContactInfo,
    initialVariables: Record<string, unknown>,
    flowId: string,
    waId: string,
    waBusinessNumber: string,
  ): OrchestratorResult {
    if (flow.status !== 'published') {
      throw new ValidationError(`Flow '${flowId}' is not published`);
    }

    const startNode = flow.nodes.find(n => n.type === NodeType.START);
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

    return this.runLoop(session, contact, flow, undefined);
  }

  resumeFlow(
    flow: FlowEntity,
    contact: ContactInfo,
    session: SessionEntity,
    userInput: string,
  ): OrchestratorResult {
    if (session.status === 'completed' || session.status === 'timed_out') {
      throw new ValidationError(`Session '${session.id}' is already ${session.status}`);
    }
    if (session.status === 'error') {
      throw new ValidationError(`Session '${session.id}' is in error state`);
    }

    session.clearWaitingFor();
    session.isCurrent = true;

    return this.runLoop(session, contact, flow, userInput);
  }

  private runLoop(
    session: SessionEntity,
    contact: ContactInfo,
    flow: FlowEntity,
    userInput: string | undefined,
  ): OrchestratorResult {
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

      // Apply variable mutations to in-memory entities
      for (const m of stepResult.variableMutations) {
        this.applyMutation(m, session, contact, allContactMutations);
      }

      // Record history
      session.addToHistory(stepResult.historyStep);

      // Advance node pointer
      if (stepResult.nextNodeId) {
        session.moveToNode(stepResult.nextNodeId);
      }

      allMessages.push(...stepResult.outboundMessages);

      // Waiting for user input
      if (stepResult.waitForInput) {
        session.setWaitingFor(stepResult.waitForInput);
        if (stepResult.nextNodeId) session.moveToNode(stepResult.nextNodeId);
        return {
          session,
          outboundMessages: allMessages,
          isFinished: false,
          waitingFor: stepResult.waitForInput,
          contactMutations: allContactMutations,
        };
      }

      // Flow finished
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

  private applyMutation(
    mutation: VariableMutation,
    session: SessionEntity,
    contact: ContactInfo,
    contactMutations: Record<string, unknown>,
  ): void {
    if (mutation.scope === 'session') {
      session.setVariable(mutation.key, mutation.value);
    } else {
      // Apply to in-memory contact (not persisted — contact management removed)
      contact.customFields[mutation.key] = mutation.value;
      contactMutations[mutation.key] = mutation.value;
    }
  }
}
