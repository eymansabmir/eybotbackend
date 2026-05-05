import { FlowEntity, FlowProperties } from './flow.entity';
import { IFlowRepository } from './flow.repository';
import { NodeType } from '../../schemas/node-types.enum';
import { ValidationError } from '../../utils/errors';
import { syncFlowTranslations } from '../../plugins/i18n/syncTranslations';
import { env } from '../../config/env';

export interface IFlowService {
  createFlow(data: Partial<FlowProperties>): Promise<FlowEntity>;
  getFlowById(id: string): Promise<FlowEntity>;
  getFlowsByOrgId(orgId: string, status?: string): Promise<FlowEntity[]>;
  updateFlow(id: string, updates: Partial<FlowProperties>): Promise<FlowEntity>;
  publishFlow(id: string): Promise<FlowEntity>;
  configureFlow(id: string, payload: ConfigureFlowPayload, credentials?: unknown): Promise<FlowEntity>;
  archiveFlow(id: string): Promise<FlowEntity>;
  deleteFlow(id: string): Promise<void>;
  validateGraph(entity: FlowEntity): void;
  syncTranslations(id: string, nodes?: any[]): Promise<void>;
  getFlowTranslation(flowId: string, language: string): Promise<any>;
  updateFlowTranslation(flowId: string, language: string, translatedData: any): Promise<void>;
}

export interface ConfigureFlowPayload {
  triggerConfig?: FlowProperties['triggerConfig'];
  isConfigured?: boolean;
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
      triggerConfig: data.triggerConfig ?? { logicalOperator: 'OR' },
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
      const allowedPublishedUpdateKeys = new Set(['settings', 'triggerConfig', 'isConfigured']);
      const hasUnsupportedUpdate = Object.keys(updates).some((key) => !allowedPublishedUpdateKeys.has(key));

      if (hasUnsupportedUpdate) {
        throw new ValidationError('Cannot update published flow structure. Archive it first.');
      }
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

  async configureFlow(id: string, payload: ConfigureFlowPayload, credentials?: unknown): Promise<FlowEntity> {
    const flow = await this.flowRepo.findByIdOrFail(id);

    const triggerConfig = payload.triggerConfig ?? flow.triggerConfig;

    if (credentials) {
      // Defer storing to CredentialService. Here we just log securely
      logger.debug('Received WhatsApp Credentials for configuration overlay.');
    }

    const updates: Partial<FlowProperties> = {
      triggerConfig,
      isConfigured: payload.isConfigured !== undefined ? payload.isConfigured : true,
      status: 'published',
      publishedAt: new Date()
    };
    
    // Validation and prep. Must pass class instance.
    const validationClone = flow.clone();
    Object.assign(validationClone, updates);
    this.validateGraph(validationClone);
    
    return this.flowRepo.update(id, updates);
  }

  async syncTranslations(id: string, nodes?: any[]): Promise<void> {
    const flow = await this.flowRepo.findByIdOrFail(id);
    const sourceNodes = (nodes || flow.nodes) as any[] || [];

    // Collect all unique languages from all Language Selection nodes
    const allLanguages = new Set<string>();
    sourceNodes.filter(n => n.type === NodeType.LANGUAGE).forEach(n => {
      const langs = n.data?.languages;
      if (Array.isArray(langs)) langs.forEach(l => allLanguages.add(l));
    });

    const targetLanguages = Array.from(allLanguages);

    if (targetLanguages.length > 0) {
      try {
        await syncFlowTranslations(
          this.flowRepo,
          id,
          targetLanguages,
          nodes
        );
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : 'Unknown translation error';
        throw new ValidationError(`Translation sync failed: ${reason}`);
      }
    }
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

  async getFlowTranslation(flowId: string, language: string): Promise<any> {
    return this.flowRepo.getTranslation(flowId, language);
  }

  async updateFlowTranslation(flowId: string, language: string, translatedData: any): Promise<void> {
    await this.flowRepo.saveTranslation(flowId, language, translatedData);
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
        const branchKeys = new Set(sourceNode.branches.map(b => b.key));

        // For interactive nodes (send_cards, send_buttons, send_list etc.) the branch
        // keys come from button/row IDs which may not always be in the branches array
        // (e.g. when data was saved with an older version of the frontend).
        // We derive the valid keys from node data to remain backward-compatible.
        if (sourceNode.type === NodeType.SEND_CARDS) {
          const items = (sourceNode.data['items'] as any[]) ?? [];
          items.forEach((item: any) => {
            (item.buttons ?? []).forEach((b: any) => { 
                if (b.branchKey) branchKeys.add(b.branchKey);
                if (b.id) branchKeys.add(b.id); 
            });
          });
          branchKeys.add('default');
          branchKeys.add('timeout');
        } else if (sourceNode.type === NodeType.SEND_BUTTONS) {
          const buttons = (sourceNode.data['buttons'] as any[]) ?? [];
          buttons.forEach((b: any) => { if (b.id) branchKeys.add(b.id); });
          branchKeys.add('timeout');
        } else if (sourceNode.type === NodeType.SEND_LIST) {
          const sections = (sourceNode.data['sections'] as any[]) ?? [];
          sections.forEach((s: any) => (s.rows ?? []).forEach((r: any) => { if (r.id) branchKeys.add(r.id); }));
          branchKeys.add('timeout');
        }

        if (!branchKeys.has(edge.sourceBranchKey)) {
          logger.warn(
            { path: `/validate`, nodeId: sourceNode.id, nodeType: sourceNode.type, branchKey: edge.sourceBranchKey },
            `Edge uses invalid branch key '${edge.sourceBranchKey}' for node '${sourceNode.label}'. Valid keys: ${[...branchKeys].join(', ')}`
          );
          throw new ValidationError(
            `Edge uses invalid branch key '${edge.sourceBranchKey}' for node '${sourceNode.label}'. Valid keys: ${[...branchKeys].join(', ')}`
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
