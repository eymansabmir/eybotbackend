import type { Edge } from '../../schemas/edge.schema';
import type { Node } from '../../schemas/node.schema';
import { NotFoundError } from '../../shared/errors';

export class GraphTraverser {
  private readonly nodes: Map<string, Node>;
  private readonly edgesBySource: Map<string, Edge[]>;

  constructor(nodes: Node[], edges: Edge[]) {
    this.nodes = new Map(nodes.map(n => [n.id, n]));
    this.edgesBySource = this.buildEdgeIndex(edges);
  }

  updateNodes(nodes: Node[]): void {
    // Technical fields on language nodes that must ALWAYS come from the master
    // flow, never from translation records. Translation records may contain stale
    // snapshots of these values which would silently override the user's latest
    // master-flow settings (e.g. skipIfAlreadySelected toggled OFF but the
    // translation still carries the old `true` value).
    const LANGUAGE_PROTECTED_KEYS = new Set([
      'skipIfAlreadySelected',
      'variableName',
      'variable',
      'variableScope',
      'localizationEnabled',
      'languages',
      'defaultLanguage',
      'timeoutSeconds',
    ]);

    for (const translatedNode of nodes) {
      const originalNode = this.nodes.get(translatedNode.id);
      if (originalNode) {
        // Build a safe copy of translation data, stripping protected keys for
        // language nodes so that only content fields (message, labels) are overlaid.
        let safeTranslatedData: Record<string, unknown> = { ...translatedNode.data };
        if (originalNode.type === 'language') {
          for (const key of LANGUAGE_PROTECTED_KEYS) {
            delete safeTranslatedData[key];
          }
        }

        this.nodes.set(translatedNode.id, {
          ...originalNode,
          data: {
            ...originalNode.data,       // Keep ALL original fields (technical + content)
            ...safeTranslatedData,       // Overlay only safe translated content
          },
        });
      } else {
        // Node doesn't exist in original — add it as-is
        this.nodes.set(translatedNode.id, translatedNode);
      }
    }
  }

  getNode(nodeId: string): Node {
    const node = this.nodes.get(nodeId);
    if (!node) throw new NotFoundError('Node', nodeId);
    return node;
  }

  getNextNode(sourceNodeId: string, branchKey: string): Node | null {
    const edges = this.edgesBySource.get(sourceNodeId) ?? [];
    const edge = edges.find(e => e.sourceBranchKey === branchKey);
    return edge ? this.getNode(edge.targetNodeId) : null;
  }

  private buildEdgeIndex(edges: Edge[]): Map<string, Edge[]> {
    const index = new Map<string, Edge[]>();
    for (const edge of edges) {
      const existing = index.get(edge.sourceNodeId) ?? [];
      existing.push(edge);
      index.set(edge.sourceNodeId, existing);
    }
    return index;
  }
}
