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
