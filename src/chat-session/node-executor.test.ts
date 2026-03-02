import { describe, it, expect, beforeEach } from 'vitest';
import { NodeExecutor } from './node-executor';
import { VariableResolver } from '../engine/variable-resolver';
import { ConditionEvaluator } from '../engine/condition-evaluator';
import { GraphTraverser } from '../engine/graph-traverser';
import { NodeType } from '../schemas/node-types.enum';
import { Node } from '../schemas/node.schema';
import { Edge } from '../schemas/edge.schema';
import { Session } from '../schemas/session.schema';
import { Contact } from '../schemas/contact.schema';
import { Flow } from '../schemas/flow.schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  flowId: 'flow_1',
  flowVersion: 1,
  contactId: 'contact_1',
  waId: '919999999999',
  waBusinessNumber: '15551234567',
  status: 'active',
  currentNodeId: 'node_1',
  variables: {},
  history: [],
  isCurrent: true,
  ...overrides,
});

const makeContact = (): Contact => ({
  _id: 'contact_1',
  orgId: 'org_1',
  waId: '919999999999',
  name: 'Test User',
  tags: [],
  customFields: {},
  optIn: true,
});

const makeFlow = (nodes: Node[], edges: Edge[] = []): Flow => ({
  _id: 'flow_1',
  orgId: 'org_1',
  name: 'Test Flow',
  status: 'published',
  version: 1,
  triggerType: 'inbound',
  triggerConfig: { keywords: [] },
  nodes,
  edges,
  settings: {
    timeoutSeconds: 300,
    maxSteps: 100,
    maxConsecutiveLogicSteps: 10,
    fallbackMessage: 'Something went wrong.',
  },
});

const makeNode = (id: string, type: NodeType, data: Record<string, any> = {}, branches = [{ key: 'default', label: 'Default' }]): Node => ({
  id,
  type,
  label: type,
  position: { x: 0, y: 0 },
  data,
  branches,
});

const makeEdge = (id: string, sourceNodeId: string, sourceBranchKey: string, targetNodeId: string): Edge => ({
  id,
  sourceNodeId,
  sourceBranchKey,
  targetNodeId,
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let executor: NodeExecutor;

beforeEach(() => {
  const resolver = new VariableResolver();
  executor = new NodeExecutor(resolver, new ConditionEvaluator(resolver));
});

// ---------------------------------------------------------------------------
// send_buttons: output mode
// ---------------------------------------------------------------------------

describe('send_buttons — output mode', () => {
  it('sends buttons and continues to next node', () => {
    const btnNode = makeNode('btn_node', NodeType.SEND_BUTTONS, {
      body: 'Hello',
      buttons: [{ id: 'b1', title: 'Yes' }],
    });
    const nextNode = makeNode('next_node', NodeType.END, {});
    const edge = makeEdge('e1', 'btn_node', 'default', 'next_node');
    const traverser = new GraphTraverser({ nodes: [btnNode, nextNode], edges: [edge] });

    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([btnNode, nextNode], [edge]), currentNode: btnNode },
      traverser,
    );

    expect(result.waitForInput).toBeUndefined();
    expect(result.nextNodeId).toBe('next_node');
    expect(result.outboundMessages).toHaveLength(1);
    expect(result.outboundMessages[0].type).toBe(NodeType.SEND_BUTTONS);
    expect(result.isTerminal).toBe(false);
    expect(result.historyStep.exitedAt).toBeDefined();
    expect(result.historyStep.branchTaken).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// send_buttons: input mode — pause and wait
// ---------------------------------------------------------------------------

describe('send_buttons — input mode pause', () => {
  const buttonId = 'btn_abc';

  const interactiveNode = makeNode(
    'btn_node',
    NodeType.SEND_BUTTONS,
    {
      body: 'Pick one',
      buttons: [{ id: buttonId, title: 'Option A' }],
      interaction: {
        mode: 'input',
        input: {
          type: 'choice',
          timeoutSeconds: 3600,
          options: [{ id: buttonId, label: 'Option A', branchKey: buttonId }],
        },
      },
    },
    [{ key: buttonId, label: 'Option A' }, { key: 'timeout', label: 'Timeout' }],
  );

  it('returns waitForInput when no userInput provided', () => {
    const traverser = new GraphTraverser({ nodes: [interactiveNode], edges: [] });

    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([interactiveNode]), currentNode: interactiveNode },
      traverser,
    );

    expect(result.waitForInput).toBeDefined();
    expect(result.waitForInput!.type).toBe('choice');
    expect(result.isTerminal).toBe(false);
    expect(result.nextNodeId).toBe('btn_node'); // stays on same node
    expect(result.outboundMessages).toHaveLength(1); // still sends the message
    expect(result.historyStep.exitedAt).toBeUndefined(); // not exited yet
    expect(result.historyStep.branchTaken).toBeUndefined();
  });

  it('waitForInput.timeoutAt is in the future', () => {
    const traverser = new GraphTraverser({ nodes: [interactiveNode], edges: [] });
    const before = Date.now();

    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([interactiveNode]), currentNode: interactiveNode },
      traverser,
    );

    expect(result.waitForInput!.timeoutAt.getTime()).toBeGreaterThan(before);
  });

  it('waitForInput.options match buttons', () => {
    const traverser = new GraphTraverser({ nodes: [interactiveNode], edges: [] });

    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([interactiveNode]), currentNode: interactiveNode },
      traverser,
    );

    const choiceWaiting = result.waitForInput as any;
    expect(choiceWaiting.options).toHaveLength(1);
    expect(choiceWaiting.options[0].id).toBe(buttonId);
    expect(choiceWaiting.options[0].branchKey).toBe(buttonId);
  });
});

// ---------------------------------------------------------------------------
// send_buttons: input mode — resume with userInput
// ---------------------------------------------------------------------------

describe('send_buttons — input mode resume', () => {
  const btn1 = 'btn_yes';
  const btn2 = 'btn_no';

  const interactiveNode = makeNode(
    'btn_node',
    NodeType.SEND_BUTTONS,
    {
      body: 'Yes or No?',
      buttons: [
        { id: btn1, title: 'Yes' },
        { id: btn2, title: 'No' },
      ],
      interaction: {
        mode: 'input',
        input: {
          type: 'choice',
          timeoutSeconds: 3600,
          options: [
            { id: btn1, label: 'Yes', branchKey: btn1 },
            { id: btn2, label: 'No', branchKey: btn2 },
          ],
        },
      },
    },
    [{ key: btn1, label: 'Yes' }, { key: btn2, label: 'No' }, { key: 'timeout', label: 'Timeout' }],
  );

  const yesNode = makeNode('yes_node', NodeType.SEND_TEXT, { message: 'You chose yes' });
  const noNode = makeNode('no_node', NodeType.SEND_TEXT, { message: 'You chose no' });

  const edges = [
    makeEdge('e1', 'btn_node', btn1, 'yes_node'),
    makeEdge('e2', 'btn_node', btn2, 'no_node'),
  ];

  const traverser = new GraphTraverser({
    nodes: [interactiveNode, yesNode, noNode],
    edges,
  });

  it('routes to correct branch when user selects button 1', () => {
    const result = executor.execute(
      {
        session: makeSession(),
        contact: makeContact(),
        flow: makeFlow([interactiveNode, yesNode, noNode], edges),
        currentNode: interactiveNode,
        userInput: btn1,
      },
      traverser,
    );

    expect(result.waitForInput).toBeUndefined();
    expect(result.nextNodeId).toBe('yes_node');
    expect(result.historyStep.branchTaken).toBe(btn1);
    expect(result.historyStep.userInput).toBe(btn1);
    expect(result.historyStep.exitedAt).toBeDefined();
  });

  it('routes to correct branch when user selects button 2', () => {
    const result = executor.execute(
      {
        session: makeSession(),
        contact: makeContact(),
        flow: makeFlow([interactiveNode, yesNode, noNode], edges),
        currentNode: interactiveNode,
        userInput: btn2,
      },
      traverser,
    );

    expect(result.nextNodeId).toBe('no_node');
    expect(result.historyStep.branchTaken).toBe(btn2);
  });

  it('falls back to default branch when userInput does not match any option', () => {
    const result = executor.execute(
      {
        session: makeSession(),
        contact: makeContact(),
        flow: makeFlow([interactiveNode, yesNode, noNode], edges),
        currentNode: interactiveNode,
        userInput: 'unknown_id',
      },
      traverser,
    );

    expect(result.historyStep.branchTaken).toBe('default');
    expect(result.nextNodeId).toBeNull(); // no 'default' edge defined
  });

  it('does NOT send outbound messages again on resume', () => {
    const result = executor.execute(
      {
        session: makeSession(),
        contact: makeContact(),
        flow: makeFlow([interactiveNode, yesNode, noNode], edges),
        currentNode: interactiveNode,
        userInput: btn1,
      },
      traverser,
    );

    expect(result.outboundMessages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ask_question: pause and resume
// ---------------------------------------------------------------------------

describe('ask_question — pause and resume', () => {
  const askNode = makeNode(
    'ask_node',
    NodeType.ASK_QUESTION,
    {
      message: 'What is your name?',
      variableName: 'name',
      variableScope: 'session',
      inputType: 'text',
      timeoutSeconds: 300,
    },
    [{ key: 'default', label: 'Default' }, { key: 'timeout', label: 'Timeout' }],
  );

  it('returns waitForInput with type text when no userInput', () => {
    const traverser = new GraphTraverser({ nodes: [askNode], edges: [] });

    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([askNode]), currentNode: askNode },
      traverser,
    );

    expect(result.waitForInput).toBeDefined();
    expect(result.waitForInput!.type).toBe('text');
    expect(result.isTerminal).toBe(false);
    expect(result.nextNodeId).toBe('ask_node');
  });

  it('stores variable mutation on resume', () => {
    const nextNode = makeNode('next_node', NodeType.END, {});
    const edge = makeEdge('e1', 'ask_node', 'default', 'next_node');
    const traverser = new GraphTraverser({ nodes: [askNode, nextNode], edges: [edge] });

    const result = executor.execute(
      {
        session: makeSession(),
        contact: makeContact(),
        flow: makeFlow([askNode, nextNode], [edge]),
        currentNode: askNode,
        userInput: 'Alice',
      },
      traverser,
    );

    expect(result.waitForInput).toBeUndefined();
    expect(result.variableMutations).toHaveLength(1);
    expect(result.variableMutations[0]).toMatchObject({
      scope: 'session',
      key: 'name',
      value: 'Alice',
    });
    expect(result.historyStep.userInput).toBe('Alice');
    expect(result.nextNodeId).toBe('next_node');
  });
});

// ---------------------------------------------------------------------------
// send_text: outbound only, no input
// ---------------------------------------------------------------------------

describe('send_text — outbound only', () => {
  it('sends message and advances to next node', () => {
    const textNode = makeNode('text_node', NodeType.SEND_TEXT, { message: 'Hello World' });
    const endNode = makeNode('end_node', NodeType.END, {}, []);
    const edge = makeEdge('e1', 'text_node', 'default', 'end_node');
    const traverser = new GraphTraverser({ nodes: [textNode, endNode], edges: [edge] });

    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([textNode, endNode], [edge]), currentNode: textNode },
      traverser,
    );

    expect(result.waitForInput).toBeUndefined();
    expect(result.nextNodeId).toBe('end_node');
    expect(result.outboundMessages[0].payload.message).toBe('Hello World');
  });

  it('resolves variable templates in message', () => {
    const textNode = makeNode('text_node', NodeType.SEND_TEXT, { message: 'Hello {{session.name}}!' });
    const traverser = new GraphTraverser({ nodes: [textNode], edges: [] });
    const session = makeSession({ variables: { name: 'Bob' } });

    const result = executor.execute(
      { session, contact: makeContact(), flow: makeFlow([textNode]), currentNode: textNode },
      traverser,
    );

    expect(result.outboundMessages[0].payload.message).toBe('Hello Bob!');
  });
});

// ---------------------------------------------------------------------------
// Regression: interaction must always be read from node.data, not node root
// ---------------------------------------------------------------------------

describe('Regression: interaction location', () => {
  it('node with interaction at node.data.interaction (not root) correctly waits for input', () => {
    const btnId = 'btn_reg';
    const node = makeNode(
      'reg_node',
      NodeType.SEND_BUTTONS,
      {
        body: 'Test',
        buttons: [{ id: btnId, title: 'Reg Button' }],
        interaction: { mode: 'input', input: { type: 'choice', timeoutSeconds: 300 } },
        // NOTE: interaction is in data — this is the correct location
      },
    );

    // Ensure the node itself does NOT have a root-level interaction field
    expect((node as any).interaction).toBeUndefined();

    const traverser = new GraphTraverser({ nodes: [node], edges: [] });
    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([node]), currentNode: node },
      traverser,
    );

    // Should wait for input, NOT fall through to output mode
    expect(result.waitForInput).toBeDefined();
    expect(result.isTerminal).toBe(false);
  });

  it('node without interaction in data falls through to output mode', () => {
    const node = makeNode('out_node', NodeType.SEND_BUTTONS, {
      body: 'Just output',
      buttons: [{ id: 'b1', title: 'B1' }],
      // No interaction field
    });

    const traverser = new GraphTraverser({ nodes: [node], edges: [] });
    const result = executor.execute(
      { session: makeSession(), contact: makeContact(), flow: makeFlow([node]), currentNode: node },
      traverser,
    );

    expect(result.waitForInput).toBeUndefined();
    expect(result.outboundMessages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// NodeExecutor completeness: all NodeTypes have a handler
// ---------------------------------------------------------------------------

describe('NodeExecutor completeness', () => {
  it('handles every registered NodeType without throwing unsupported error', () => {
    const allTypes = Object.values(NodeType);

    const minimalDataByType: Record<string, Record<string, any>> = {
      [NodeType.SEND_TEXT]: { message: 'hi' },
      [NodeType.SEND_IMAGE]: { url: 'https://example.com/img.jpg' },
      [NodeType.SEND_VIDEO]: { url: 'https://example.com/vid.mp4' },
      [NodeType.SEND_AUDIO]: { url: 'https://example.com/aud.mp3' },
      [NodeType.SEND_DOCUMENT]: { url: 'https://example.com/doc.pdf' },
      [NodeType.SEND_LOCATION]: { latitude: 0, longitude: 0 },
      [NodeType.SEND_BUTTONS]: { body: 'x', buttons: [{ id: 'b1', title: 'B' }] },
      [NodeType.SEND_LIST]: { body: 'x', buttonTitle: 'Pick', sections: [{ title: 'S', rows: [{ id: 'r1', title: 'Row' }] }] },
      [NodeType.SEND_TEMPLATE]: { templateName: 't', languageCode: 'en', components: [] },
      [NodeType.ASK_QUESTION]: { message: 'q', variableName: 'v', variableScope: 'session', inputType: 'text', timeoutSeconds: 60 },
      [NodeType.CONDITION]: { expression: { operator: 'AND', rules: [] } },
      [NodeType.SET_VARIABLE]: { assignments: [] },
      [NodeType.RANDOM_SPLIT]: { branches: [{ key: 'a', label: 'A', percentage: 100 }] },
      [NodeType.START]: {},
      [NodeType.END]: {},
      [NodeType.JUMP_TO_FLOW]: { targetFlowId: 'other_flow' },
      [NodeType.HUMAN_HANDOFF]: {},
      [NodeType.WEBHOOK]: { url: 'https://example.com', method: 'POST', timeoutMs: 5000 },
      [NodeType.GOOGLE_SHEETS]: { spreadsheetId: 'x', sheetName: 'y', action: 'append_row' },
      [NodeType.NOCODB]: { baseId: 'x', tableId: 'y', action: 'read' },
    };

    for (const type of allTypes) {
      const data = minimalDataByType[type] ?? {};
      const node = makeNode(`test_${type}`, type as NodeType, data);
      const traverser = new GraphTraverser({ nodes: [node], edges: [] });

      expect(() => {
        executor.execute(
          { session: makeSession(), contact: makeContact(), flow: makeFlow([node]), currentNode: node },
          traverser,
        );
      }).not.toThrow();
    }
  });
});
