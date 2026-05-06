import { FlowEntity, FlowProperties } from './flow.entity';
import { IFlowRepository } from './flow.repository';
import { NodeType } from '../../schemas/node-types.enum';
import { ValidationError } from '../../utils/errors';
import { syncFlowTranslations } from '../../plugins/i18n/syncTranslations';
import { simplifyTriggerText } from '../session/trigger-normalization';
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
  syncTranslations(id: string): Promise<void>;
  getFlowTranslation(flowId: string, language: string): Promise<any>;
  updateFlowTranslation(flowId: string, language: string, translatedData: any): Promise<void>;
  importFlow(data: Partial<FlowProperties>, orgId: string): Promise<FlowEntity>;
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
    await this.validateTriggerUniqueness(entity.orgId, entity.triggerConfig);
    return this.flowRepo.create(entity);
  }

  async importFlow(data: Partial<FlowProperties>, orgId: string): Promise<FlowEntity> {
    const importData = {
      ...data,
      orgId,
      status: 'draft' as const,
      isConfigured: false,
      name: data.name || 'Imported Bot',
    };
    
    // Remove database-specific fields if present
    delete importData.id;
    delete (importData as any).createdAt;
    delete (importData as any).updatedAt;
    delete (importData as any).publishedAt;

    return this.createFlow(importData);
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
    // Normalize media URLs to storage paths for consistency with createFlow.
    // Full GCS/CDN URLs are stripped back to relative paths so the executor
    // can resolve them correctly at runtime via the storage plugin.
    if (updates.nodes && updates.nodes.length > 0) {
      const tempEntity = existing.clone();
      tempEntity.nodes = updates.nodes;
      this.normalizeNodeUrls(tempEntity);
      updates.nodes = tempEntity.nodes;
    }

    if (updates.triggerConfig) {
      await this.validateTriggerUniqueness(existing.orgId, updates.triggerConfig, id);
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
    if (updates.triggerConfig) {
      await this.validateTriggerUniqueness(flow.orgId, updates.triggerConfig, id);
    }
    
    return this.flowRepo.update(id, updates);
  }

  async syncTranslations(id: string): Promise<void> {
    const flow = await this.flowRepo.findByIdOrFail(id);
    const localization = (flow.settings as any)?.localization;

    if (localization?.isEnabled && Array.isArray(localization.languages) && localization.languages.length > 0) {
      try {
        await syncFlowTranslations(
          this.flowRepo,
          id,
          localization.languages
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
    const mediaNodeTypes = new Set([
      NodeType.SEND_IMAGE,
      NodeType.SEND_VIDEO,
      NodeType.SEND_AUDIO,
      NodeType.SEND_DOCUMENT,
      NodeType.SEND_STICKER,
    ]);

    const normalize = (val: any) => {
      if (typeof val !== 'string' || !val.startsWith('http') || (val.includes('{{') && val.includes('}}'))) {
        return val;
      }
      try {
        if (base && val.startsWith(base)) {
          return val.replace(`${base}/`, '');
        }
        return new URL(val).pathname.replace(/^\/+/, '');
      } catch {
        return val;
      }
    };

    for (const node of entity.nodes) {
      if (!node.data) continue;

      if (mediaNodeTypes.has(node.type as NodeType)) {
        node.data.url = normalize(node.data.url);
      } else if (node.type === NodeType.SEND_CARDS) {
        const items = (node.data['items'] as any[]) ?? [];
        items.forEach((item: any) => {
          item.imageUrl = normalize(item.imageUrl);
        });
      } else if (node.type === NodeType.SEND_CAROUSEL) {
        const cards = (node.data['cards'] as any[]) ?? [];
        cards.forEach((card: any) => {
          card.url = normalize(card.url);
          if (card.ctaUrlButton?.url) {
            card.ctaUrlButton.url = normalize(card.ctaUrlButton.url);
          }
        });
      }
    }
  }

  private async validateTriggerUniqueness(orgId: string, triggerConfig: FlowProperties['triggerConfig'], excludeFlowId?: string): Promise<void> {
    if (!triggerConfig) return;

    const allFlows = await this.flowRepo.findByOrgId(orgId);
    const otherFlows = excludeFlowId ? allFlows.filter(f => f.id !== excludeFlowId) : allFlows;

    const newKeywords = (triggerConfig.keywords || []).map(k => simplifyTriggerText(k)).filter(Boolean);
    const newComparisons = (triggerConfig.comparisons || []).filter(c => c.value.trim().length > 0);

    for (const flow of otherFlows) {
      const existingKeywords = (flow.triggerConfig?.keywords || []).map(k => simplifyTriggerText(k)).filter(Boolean);
      const existingComparisons = (flow.triggerConfig?.comparisons || []).filter(c => c.value.trim().length > 0);

      // Check keywords
      for (const kw of newKeywords) {
        if (existingKeywords.includes(kw)) {
          throw new ValidationError(`Trigger keyword '${kw}' is already in use by bot '${flow.name}'`);
        }
      }

      // Check comparisons
      for (const comp of newComparisons) {
        const normalizedVal = simplifyTriggerText(comp.value);
        const duplicate = existingComparisons.find(ec => 
          ec.operator === comp.operator && simplifyTriggerText(ec.value) === normalizedVal
        );
        if (duplicate) {
          throw new ValidationError(`Trigger condition '${comp.operator} ${comp.value}' is already in use by bot '${flow.name}'`);
        }
      }
    }
  }
}
