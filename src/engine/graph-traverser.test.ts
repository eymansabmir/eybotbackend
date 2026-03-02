import { describe, it, expect, beforeEach } from 'vitest';
import { GraphTraverser } from './graph-traverser';
import { Node } from '../schemas/node.schema';
import { Edge } from '../schemas/edge.schema';
import { NodeType } from '../schemas/node-types.enum';
import { NotFoundError } from '../utils/errors';

describe('GraphTraverser', () => {
  let nodes: Node[];
  let edges: Edge[];
  let traverser: GraphTraverser;

  beforeEach(() => {
    nodes = [
      {
        id: 'node_1',
        type: NodeType.START,
        label: 'Start',
        position: { x: 0, y: 0 },
        data: {},
        branches: [{ key: 'default', label: 'Next' }],
      },
      {
        id: 'node_2',
        type: NodeType.SEND_TEXT,
        label: 'Send Message',
        position: { x: 100, y: 0 },
        data: { message: 'Hello' },
        branches: [{ key: 'default', label: 'Next' }],
      },
      {
        id: 'node_3',
        type: NodeType.END,
        label: 'End',
        position: { x: 200, y: 0 },
        data: {},
        branches: [],
      },
    ];

    edges = [
      {
        id: 'edge_1',
        sourceNodeId: 'node_1',
        sourceBranchKey: 'default',
        targetNodeId: 'node_2',
      },
      {
        id: 'edge_2',
        sourceNodeId: 'node_2',
        sourceBranchKey: 'default',
        targetNodeId: 'node_3',
      },
    ];

    traverser = new GraphTraverser({ nodes, edges });
  });

  it('should get node by id', () => {
    const node = traverser.getNode('node_1');
    expect(node.id).toBe('node_1');
    expect(node.type).toBe(NodeType.START);
  });

  it('should throw NotFoundError for non-existent node', () => {
    expect(() => traverser.getNode('node_999')).toThrow(NotFoundError);
  });

  it('should get next node by source and branch key', () => {
    const nextNode = traverser.getNextNode('node_1', 'default');
    expect(nextNode?.id).toBe('node_2');
  });

  it('should return null when no edge matches branch key', () => {
    const nextNode = traverser.getNextNode('node_1', 'non_existent');
    expect(nextNode).toBeNull();
  });

  it('should return null when source node has no outgoing edges', () => {
    const nextNode = traverser.getNextNode('node_3', 'default');
    expect(nextNode).toBeNull();
  });

  it('should check if node exists', () => {
    expect(traverser.hasNode('node_1')).toBe(true);
    expect(traverser.hasNode('node_999')).toBe(false);
  });

  it('should get all nodes', () => {
    const allNodes = traverser.getAllNodes();
    expect(allNodes).toHaveLength(3);
  });

  it('should get all edges', () => {
    const allEdges = traverser.getAllEdges();
    expect(allEdges).toHaveLength(2);
  });

  it('should handle multiple branches from same node', () => {
    const conditionNode: Node = {
      id: 'node_condition',
      type: NodeType.CONDITION,
      label: 'Check Age',
      position: { x: 150, y: 0 },
      data: {},
      branches: [
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' },
      ],
    };

    const yesNode: Node = {
      id: 'node_yes',
      type: NodeType.SEND_TEXT,
      label: 'Yes Path',
      position: { x: 200, y: -50 },
      data: {},
      branches: [],
    };

    const noNode: Node = {
      id: 'node_no',
      type: NodeType.SEND_TEXT,
      label: 'No Path',
      position: { x: 200, y: 50 },
      data: {},
      branches: [],
    };

    const branchEdges: Edge[] = [
      {
        id: 'edge_yes',
        sourceNodeId: 'node_condition',
        sourceBranchKey: 'yes',
        targetNodeId: 'node_yes',
      },
      {
        id: 'edge_no',
        sourceNodeId: 'node_condition',
        sourceBranchKey: 'no',
        targetNodeId: 'node_no',
      },
    ];

    const branchTraverser = new GraphTraverser({
      nodes: [conditionNode, yesNode, noNode],
      edges: branchEdges,
    });

    const yesPath = branchTraverser.getNextNode('node_condition', 'yes');
    const noPath = branchTraverser.getNextNode('node_condition', 'no');

    expect(yesPath?.id).toBe('node_yes');
    expect(noPath?.id).toBe('node_no');
  });
});
