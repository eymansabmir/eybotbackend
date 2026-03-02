import { Edge } from '../schemas/edge.schema';
import { Node } from '../schemas/node.schema';
import { NotFoundError } from '../utils/errors';

export interface GraphTraverserOptions {
  nodes: Node[];
  edges: Edge[];
}

export class GraphTraverser {
  private readonly nodes: Map<string, Node>;
  private readonly edgesBySource: Map<string, Edge[]>;

  constructor(options: GraphTraverserOptions) {
    this.nodes = new Map(options.nodes.map(node => [node.id, node]));
    this.edgesBySource = this.buildEdgeIndex(options.edges);
  }

  getNode(nodeId: string): Node {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new NotFoundError('Node', nodeId);
    }
    return node;
  }

  getNextNode(sourceNodeId: string, branchKey: string): Node | null {
    const edges = this.edgesBySource.get(sourceNodeId) || [];
    const edge = edges.find(e => e.sourceBranchKey === branchKey);

    if (!edge) {
      return null;
    }

    return this.getNode(edge.targetNodeId);
  }

  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): Edge[] {
    return Array.from(this.edgesBySource.values()).flat();
  }

  private buildEdgeIndex(edges: Edge[]): Map<string, Edge[]> {
    const index = new Map<string, Edge[]>();

    for (const edge of edges) {
      const existing = index.get(edge.sourceNodeId) || [];
      existing.push(edge);
      index.set(edge.sourceNodeId, existing);
    }

    return index;
  }
}
