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
  syncTranslations(id: string, nodes?: any[]): Promise<void>;
  getFlowTranslation(flowId: string, language: string): Promise<any>;
  updateFlowTranslation(flowId: string, language: string, translatedData: any): Promise<void>;
  importFlow(data: Partial<FlowProperties>, orgId: string): Promise<FlowEntity>;
  getFlowRevisions(flowId: string): Promise<any[]>;
  rollbackToRevision(flowId: string, revisionId: string): Promise<FlowEntity>;
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
      creatorId: data.creatorId,
      renudgeConfig: data.renudgeConfig,
    });
    this.normalizeNodeUrls(entity);
    this.validateGraph(entity);
    await this.validateTriggerUniqueness(entity.orgId, entity.triggerConfig);
    const createdFlow = await this.flowRepo.create(entity);
    if (createdFlow.status === 'published') {
      await this.createFlowRevisionSnapshot(createdFlow.id!, createdFlow, true);
    }
    return createdFlow;
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
    const flow = await this.flowRepo.findByIdOrFail(id);
    this.denormalizeNodeUrls(flow);
    return flow;
  }

  async getFlowsByOrgId(orgId: string, status?: string): Promise<FlowEntity[]> {
    const flows = await this.flowRepo.findByOrgId(orgId, status as any);
    flows.forEach(f => this.denormalizeNodeUrls(f));
    return flows;
  }

  async updateFlow(id: string, updates: Partial<FlowProperties>): Promise<FlowEntity> {
    const existing = await this.flowRepo.findByIdOrFail(id);
    if (existing.status === 'published') {
      const allowedPublishedUpdateKeys = new Set(['settings', 'triggerConfig', 'isConfigured', 'renudgeConfig']);
      const hasUnsupportedUpdate = Object.keys(updates).some((key) => !allowedPublishedUpdateKeys.has(key));

      if (hasUnsupportedUpdate) {
        throw new ValidationError('Cannot update published flow structure. Archive it first.');
      }
    }
    if (updates.nodes && updates.nodes.length > 0) {
      const tempEntity = existing.clone();
      tempEntity.nodes = updates.nodes;
      this.normalizeNodeUrls(tempEntity);
      updates.nodes = tempEntity.nodes;
    }

    if (updates.triggerConfig) {
      await this.validateTriggerUniqueness(existing.orgId, updates.triggerConfig, id);
    }

    const updated = await this.flowRepo.update(id, updates);
    this.denormalizeNodeUrls(updated);
    if (updated.status === 'published') {
      await this.createFlowRevisionSnapshot(id, updated, true);
    }
    return updated;
  }

  async publishFlow(id: string): Promise<FlowEntity> {
    const flow = await this.flowRepo.findByIdOrFail(id);
    if (flow.status === 'published') {
      throw new ValidationError('Flow is already published');
    }
    this.validateGraph(flow);
    const updated = await this.flowRepo.update(id, { status: 'published', publishedAt: new Date() });
    await this.createFlowRevisionSnapshot(id, updated, true);
    return updated;
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

    const updated = await this.flowRepo.update(id, updates);
    await this.createFlowRevisionSnapshot(id, updated, true);
    return updated;
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
        } else if (sourceNode.type === NodeType.JUMP || sourceNode.type === NodeType.RETURN) {
          branchKeys.add('default');
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
    const bucketName = env.GCS_BUCKET_NAME;

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
        const url = new URL(val);

        // 1. Handle BASE_MEDIA_URL
        if (base && val.startsWith(base)) {
          return val.replace(`${base}/`, '');
        }

        // 2. Handle GCS Standard: https://storage.googleapis.com/{bucket}/
        if (url.hostname === 'storage.googleapis.com') {
          const parts = url.pathname.replace(/^\/+/, '').split('/');
          if (bucketName && parts[0] === bucketName) {
            return parts.slice(1).join('/');
          }
          return url.pathname.replace(/^\/+/, '');
        }

        // 3. Handle Bucket-first: https://{bucket}.storage.googleapis.com/
        if (url.hostname.endsWith('.storage.googleapis.com')) {
          const bucketFromUrl = url.hostname.replace('.storage.googleapis.com', '');
          if (bucketName && bucketFromUrl === bucketName) {
            return url.pathname.replace(/^\/+/, '');
          }
        }

        return val;
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

  private denormalizeNodeUrls(entity: FlowEntity): void {
    const base = env.BASE_MEDIA_URL;
    const bucketName = env.GCS_BUCKET_NAME;

    const denormalize = (val: any) => {
      if (typeof val !== 'string' || val.startsWith('http') || (val.includes('{{') && val.includes('}}'))) {
        return val;
      }

      // If it's a relative path, resolve it
      if (base) {
        return `${base}/${val}`;
      }
      if (bucketName) {
        return `https://storage.googleapis.com/${bucketName}/${val}`;
      }
      return val;
    };

    const mediaNodeTypes = new Set([
      NodeType.SEND_IMAGE,
      NodeType.SEND_VIDEO,
      NodeType.SEND_AUDIO,
      NodeType.SEND_DOCUMENT,
      NodeType.SEND_STICKER,
    ]);

    for (const node of entity.nodes) {
      if (!node.data) continue;

      if (mediaNodeTypes.has(node.type as NodeType)) {
        node.data.url = denormalize(node.data.url);
      } else if (node.type === NodeType.SEND_CARDS) {
        const items = (node.data['items'] as any[]) ?? [];
        items.forEach((item: any) => {
          item.imageUrl = denormalize(item.imageUrl);
        });
      } else if (node.type === NodeType.SEND_CAROUSEL) {
        const cards = (node.data['cards'] as any[]) ?? [];
        cards.forEach((card: any) => {
          card.url = denormalize(card.url);
          if (card.ctaUrlButton?.url) {
            card.ctaUrlButton.url = denormalize(card.ctaUrlButton.url);
          }
        });
      }
    }
  }

  private async validateTriggerUniqueness(orgId: string, triggerConfig: FlowProperties['triggerConfig'], excludeFlowId?: string): Promise<void> {
    if (!triggerConfig) return;

    const allFlows = await this.flowRepo.findByOrgId(orgId);
    const otherFlows = excludeFlowId ? allFlows.filter(f => f.id !== excludeFlowId) : allFlows;

    const normalize = (val: string) => simplifyTriggerText(val);

    const newItems = [
      ...(triggerConfig.keywords || []).map(k => ({ op: 'KEYWORD', val: normalize(k) })),
      ...(triggerConfig.comparisons || []).map(c => ({ op: c.operator, val: normalize(c.value) }))
    ].filter(i => i.val.length > 0);

    for (const flow of otherFlows) {
      const existingItems = [
        ...(flow.triggerConfig?.keywords || []).map(k => ({ op: 'KEYWORD', val: normalize(k) })),
        ...(flow.triggerConfig?.comparisons || []).map(c => ({ op: c.operator, val: normalize(c.value) }))
      ].filter(i => i.val.length > 0);

      for (const ni of newItems) {
        for (const ei of existingItems) {
          const v1 = ni.val;
          const v2 = ei.val;
          const op1 = ni.op;
          const op2 = ei.op;

          // 1. Exact match check (always blocked)
          if (op1 === op2 && v1 === v2) {
            const label = op1 === 'KEYWORD' ? 'keyword' : `condition '${op1}'`;
            throw new ValidationError(`Trigger ${label} '${v1}' is already in use by bot '${flow.name}'`);
          }

          // 2. Ambiguity check: Same operator type + Containment/Overlap
          // We block cases where one condition is a subset of another, leading to scoring ties or shadowing.
          const isContains = (op: string) => op === 'CONTAINS' || op === 'KEYWORD';

          let conflict = false;
          if (isContains(op1) && isContains(op2)) {
            if (v1.includes(v2) || v2.includes(v1)) conflict = true;
          } else if (op1 === 'STARTS_WITH' && op2 === 'STARTS_WITH') {
            if (v1.startsWith(v2) || v2.startsWith(v1)) conflict = true;
          } else if (op1 === 'ENDS_WITH' && op2 === 'ENDS_WITH') {
            if (v1.endsWith(v2) || v2.endsWith(v1)) conflict = true;
          }

          if (conflict) {
            throw new ValidationError(
              `Trigger condition '${v1}' overlaps with existing condition '${v2}' in bot '${flow.name}'. ` +
              `Please select a more unique start condition to avoid ambiguity and ensure the correct bot is triggered.`
            );
          }
        }
      }
    }
  }

  private async createFlowRevisionSnapshot(flowId: string, flowEntity: FlowEntity, isPublished = false): Promise<void> {
    const revisions = await this.flowRepo.getRevisions(flowId);
    const latestRevision = revisions[0];

    if (latestRevision) {
      const isDeepEqual = (a: any, b: any): boolean => {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (a && b && typeof a === 'object' && typeof b === 'object') {
          if (Array.isArray(a) !== Array.isArray(b)) return false;
          const keysA = Object.keys(a);
          const keysB = Object.keys(b);
          if (keysA.length !== keysB.length) return false;
          for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!isDeepEqual(a[key], b[key])) return false;
          }
          return true;
        }
        return false;
      };

      const isNameEqual = flowEntity.name === latestRevision.name;
      const isDescEqual = (flowEntity.description ?? '') === (latestRevision.description ?? '');
      const isTriggerTypeEqual = flowEntity.triggerType === latestRevision.triggerType;
      const isTriggerConfigEqual = isDeepEqual(flowEntity.triggerConfig, latestRevision.triggerConfig);
      const isNodesEqual = isDeepEqual(flowEntity.nodes, latestRevision.nodes);
      const isEdgesEqual = isDeepEqual(flowEntity.edges, latestRevision.edges);
      const isSettingsEqual = isDeepEqual(flowEntity.settings, latestRevision.settings);

      if (isNameEqual && isDescEqual && isTriggerTypeEqual && isTriggerConfigEqual && isNodesEqual && isEdgesEqual && isSettingsEqual) {
        logger.info({ flowId }, 'Flow layout is identical to the latest revision. Skipping duplicate version snapshot.');
        return;
      }
    }

    const currentVersion = await this.flowRepo.getLatestRevisionVersion(flowId);
    const nextVersion = currentVersion + 1;
    await this.flowRepo.createRevision(flowId, nextVersion, flowEntity, isPublished);
    await this.flowRepo.pruneOldRevisions(flowId);
  }

  async getFlowRevisions(flowId: string): Promise<any[]> {
    return this.flowRepo.getRevisions(flowId);
  }

  async rollbackToRevision(flowId: string, revisionId: string): Promise<FlowEntity> {
    const revision = await this.flowRepo.findRevisionById(revisionId);
    if (!revision || revision.flowId !== flowId) {
      throw new ValidationError('Revision not found or does not belong to this flow');
    }

    const flow = await this.flowRepo.findByIdOrFail(flowId);
    if (flow.status === 'published') {
      throw new ValidationError('Cannot rollback a published flow. Archive it first.');
    }

    const updates: Partial<FlowProperties> = {
      name: revision.name,
      description: revision.description ?? undefined,
      triggerType: revision.triggerType,
      triggerConfig: revision.triggerConfig as any,
      nodes: revision.nodes as any,
      edges: revision.edges as any,
      settings: revision.settings as any,
    };

    const updated = await this.flowRepo.update(flowId, updates);
    this.denormalizeNodeUrls(updated);

    // Rollback copies the target revision's layout back to the active draft flow,
    // but does NOT immediately create a new revision snapshot in the version history.
    // A new revision version is only created when this rolled back draft is published.

    return updated;
  }
}
