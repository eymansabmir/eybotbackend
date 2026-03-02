import { IFlowRepository } from '../repositories/flow.repository';
import { FlowDocument } from '../models/flow.model';
import { Flow, FlowStatus } from '../schemas/flow.schema';
import { NodeType } from '../schemas/node-types.enum';
import { ValidationError } from '../utils/errors';

export interface IFlowService {
  createFlow(flow: Flow): Promise<FlowDocument>;
  getFlowById(id: string): Promise<FlowDocument>;
  getFlowsByOrgId(orgId: string, status?: FlowStatus): Promise<FlowDocument[]>;
  updateFlow(id: string, updates: Partial<Flow>): Promise<FlowDocument>;
  publishFlow(id: string): Promise<FlowDocument>;
  archiveFlow(id: string): Promise<FlowDocument>;
  deleteFlow(id: string): Promise<void>;
  validateGraph(flow: Flow): void;
}

export class FlowService implements IFlowService {
  constructor(private readonly flowRepository: IFlowRepository) {}

  async createFlow(flow: Flow): Promise<FlowDocument> {
    this.validateGraph(flow);
    return await this.flowRepository.create(flow);
  }

  async getFlowById(id: string): Promise<FlowDocument> {
    return await this.flowRepository.findByIdOrFail(id);
  }

  async getFlowsByOrgId(orgId: string, status?: FlowStatus): Promise<FlowDocument[]> {
    return await this.flowRepository.findByOrgId(orgId, status);
  }

  async updateFlow(id: string, updates: Partial<Flow>): Promise<FlowDocument> {
    const existingFlow = await this.flowRepository.findByIdOrFail(id);

    if (existingFlow.status === 'published') {
      throw new ValidationError('Cannot update a published flow. Archive it first or create a new version.');
    }

    const updatedFlow = { ...existingFlow.toObject(), ...updates };
    this.validateGraph(updatedFlow);

    return await this.flowRepository.update(id, updates);
  }

  async publishFlow(id: string): Promise<FlowDocument> {
    const flow = await this.flowRepository.findByIdOrFail(id);

    if (flow.status === 'published') {
      throw new ValidationError('Flow is already published');
    }

    this.validateGraph(flow.toObject());

    return await this.flowRepository.update(id, {
      status: 'published',
      publishedAt: new Date(),
    });
  }

  async archiveFlow(id: string): Promise<FlowDocument> {
    return await this.flowRepository.update(id, {
      status: 'archived',
    });
  }

  async deleteFlow(id: string): Promise<void> {
    const flow = await this.flowRepository.findByIdOrFail(id);

    if (flow.status === 'published') {
      throw new ValidationError('Cannot delete a published flow. Archive it first.');
    }

    await this.flowRepository.delete(id);
  }

  validateGraph(flow: Flow): void {
    const { nodes, edges } = flow;

    if (nodes.length === 0) {
      throw new ValidationError('Flow must have at least one node');
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const startNodes = nodes.filter(n => n.type === NodeType.START);
    const endNodes = nodes.filter(n => n.type === NodeType.END);

    if (startNodes.length === 0) {
      throw new ValidationError('Flow must have exactly one START node');
    }

    if (startNodes.length > 1) {
      throw new ValidationError('Flow must have exactly one START node, found multiple');
    }

    if (endNodes.length === 0) {
      throw new ValidationError('Flow must have at least one END node');
    }

    for (const edge of edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        throw new ValidationError(`Edge references non-existent source node: ${edge.sourceNodeId}`);
      }

      if (!nodeIds.has(edge.targetNodeId)) {
        throw new ValidationError(`Edge references non-existent target node: ${edge.targetNodeId}`);
      }

      const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
      if (sourceNode) {
        const branchKeys = sourceNode.branches.map(b => b.key);
        if (!branchKeys.includes(edge.sourceBranchKey)) {
          throw new ValidationError(
            `Edge uses invalid branch key '${edge.sourceBranchKey}' for node '${sourceNode.label}'. ` +
            `Valid keys: ${branchKeys.join(', ')}`
          );
        }
      }
    }

    const duplicateNodeIds = nodes
      .map(n => n.id)
      .filter((id, index, arr) => arr.indexOf(id) !== index);

    if (duplicateNodeIds.length > 0) {
      throw new ValidationError(`Duplicate node IDs found: ${duplicateNodeIds.join(', ')}`);
    }

    const duplicateEdgeIds = edges
      .map(e => e.id)
      .filter((id, index, arr) => arr.indexOf(id) !== index);

    if (duplicateEdgeIds.length > 0) {
      throw new ValidationError(`Duplicate edge IDs found: ${duplicateEdgeIds.join(', ')}`);
    }
  }
}
