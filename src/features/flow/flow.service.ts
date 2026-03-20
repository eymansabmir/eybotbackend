import { FlowEntity, FlowProperties } from './flow.entity';
import { IFlowRepository } from './flow.repository';
import { NodeType } from '../../schemas/node-types.enum';
import { ValidationError } from '../../utils/errors';
import { env } from '../../config/env';

export interface IFlowService {
  createFlow(data: Partial<FlowProperties>): Promise<FlowEntity>;
  getFlowById(id: string): Promise<FlowEntity>;
  getFlowsByOrgId(orgId: string, status?: string): Promise<FlowEntity[]>;
  updateFlow(id: string, updates: Partial<FlowProperties>): Promise<FlowEntity>;
  publishFlow(id: string): Promise<FlowEntity>;
  archiveFlow(id: string): Promise<FlowEntity>;
  deleteFlow(id: string): Promise<void>;
  validateGraph(entity: FlowEntity): void;
}

export class FlowService implements IFlowService {
  constructor(private readonly flowRepo: IFlowRepository) { }

  async createFlow(data: Partial<FlowProperties>): Promise<FlowEntity> {
    const entity = new FlowEntity({
      orgId: data.orgId!,
      name: data.name!,
      description: data.description,
      status: data.status ?? 'draft',
      version: data.version ?? 1,
      triggerType: data.triggerType!,
      triggerConfig: data.triggerConfig ?? {},
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      settings: data.settings ?? {
        timeoutSeconds: 300,
        maxSteps: 100,
        maxConsecutiveLogicSteps: 10,
        fallbackMessage: 'Sorry, something went wrong.',
      },
    });
    this.normalizeNodeUrls(entity);
    this.validateGraph(entity);
    return this.flowRepo.create(entity);
  }

  async getFlowById(id: string): Promise<FlowEntity> {
    return this.flowRepo.findByIdOrFail(id);
  }

  async getFlowsByOrgId(orgId: string, status?: string): Promise<FlowEntity[]> {
    return this.flowRepo.findByOrgId(orgId, status as any);
  }

  async updateFlow(id: string, updates: Partial<FlowProperties>): Promise<FlowEntity> {
    const existing = await this.flowRepo.findByIdOrFail(id);
    if (existing.status === 'published') {
      throw new ValidationError('Cannot update a published flow. Archive it first.');
    }
    return this.flowRepo.update(id, updates);
  }

  async publishFlow(id: string): Promise<FlowEntity> {
    const flow = await this.flowRepo.findByIdOrFail(id);
    if (flow.status === 'published') {
      throw new ValidationError('Flow is already published');
    }
    this.validateGraph(flow);
    return this.flowRepo.update(id, { status: 'published', publishedAt: new Date() });
  }

  async archiveFlow(id: string): Promise<FlowEntity> {
    return this.flowRepo.update(id, { status: 'archived' });
  }

  async deleteFlow(id: string): Promise<void> {
    const flow = await this.flowRepo.findByIdOrFail(id);
    if (flow.status === 'published') {
      throw new ValidationError('Cannot delete a published flow. Archive it first.');
    }
    await this.flowRepo.delete(id);
  }

  validateGraph(entity: FlowEntity): void {
    const { nodes, edges } = entity;
    if (nodes.length === 0) throw new ValidationError('Flow must have at least one node');

    const nodeIds = new Set(nodes.map(n => n.id));
    const startNodes = nodes.filter(n => n.type === NodeType.START);
    const endNodes = nodes.filter(n => n.type === NodeType.END);

    if (startNodes.length === 0) throw new ValidationError('Flow must have exactly one START node');
    if (startNodes.length > 1) throw new ValidationError('Flow must have exactly one START node, found multiple');
    if (endNodes.length === 0) throw new ValidationError('Flow must have at least one END node');

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
            `Edge uses invalid branch key '${edge.sourceBranchKey}' for node '${sourceNode.label}'. Valid keys: ${branchKeys.join(', ')}`
          );
        }
      }
    }

    const duplicateNodeIds = nodes.map(n => n.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    if (duplicateNodeIds.length > 0) throw new ValidationError(`Duplicate node IDs: ${duplicateNodeIds.join(', ')}`);

    const duplicateEdgeIds = edges.map(e => e.id).filter((id, i, arr) => arr.indexOf(id) !== i);
    if (duplicateEdgeIds.length > 0) throw new ValidationError(`Duplicate edge IDs: ${duplicateEdgeIds.join(', ')}`);
  }

  private normalizeNodeUrls(entity: FlowEntity): void {
    const base = env.BASE_MEDIA_URL;
    for (const node of entity.nodes) {
      if (!node.data) continue;
      switch (node.type) {
        case NodeType.SEND_IMAGE:
        case NodeType.SEND_VIDEO:
        case NodeType.SEND_AUDIO:
        case NodeType.SEND_DOCUMENT:
        case NodeType.SEND_STICKER:
          if (node.data.url && typeof node.data.url === 'string') {
            const url = node.data.url as string;
            if (url.startsWith('http')) {
              node.data.url = new URL(url).pathname.replace(/^\/+/, '');
            } else if (base && url.startsWith(base)) {
              node.data.url = url.replace(`${base}/`, '');
            }
          }
          break;
        case NodeType.SEND_CARDS:
          if (node.data.items && Array.isArray(node.data.items)) {
            for (const item of node.data.items) {
              if (item.imageUrl && typeof item.imageUrl === 'string') {
                const url = item.imageUrl as string;
                if (url.startsWith('http')) {
                  item.imageUrl = new URL(url).pathname.replace(/^\/+/, '');
                } else if (base && url.startsWith(base)) {
                  item.imageUrl = url.replace(`${base}/`, '');
                }
              }
            }
          }
          break;
      }
    }
  }
}
