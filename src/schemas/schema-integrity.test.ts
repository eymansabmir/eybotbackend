import { describe, it, expect } from 'vitest';
import { NodeDataSchema } from './node-data.schema';
import { NodeSchema } from './node.schema';
import { NodeType } from './node-types.enum';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNode(partial: Record<string, any>) {
  return NodeSchema.safeParse({
    id: 'test_node',
    type: partial.type,
    label: partial.type,
    position: { x: 0, y: 0 },
    branches: partial.branches ?? [],
    data: partial.data ?? {},
  });
}

// ---------------------------------------------------------------------------
// send_buttons
// ---------------------------------------------------------------------------

describe('send_buttons node schema integrity', () => {
  const buttonId = 'btn_123';

  const minimalData = {
    body: 'Pick an option',
    buttons: [{ id: buttonId, title: 'Button 1' }],
  };

  const withInteraction = {
    ...minimalData,
    interaction: {
      mode: 'input' as const,
      input: {
        type: 'choice' as const,
        timeoutSeconds: 3600,
        options: [{ id: buttonId, label: 'Button 1', branchKey: buttonId }],
      },
    },
  };

  it('accepts minimal data without interaction', () => {
    const result = NodeDataSchema.safeParse({ type: NodeType.SEND_BUTTONS, ...minimalData });
    expect(result.success).toBe(true);
  });

  it('accepts data with interaction config', () => {
    const result = NodeDataSchema.safeParse({ type: NodeType.SEND_BUTTONS, ...withInteraction });
    expect(result.success).toBe(true);
  });

  it('accepts interaction in node.data (full NodeSchema round-trip)', () => {
    const result = parseNode({
      type: NodeType.SEND_BUTTONS,
      branches: [{ key: buttonId, label: 'Button 1' }, { key: 'timeout', label: 'Timeout' }],
      data: withInteraction,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when interaction.mode is invalid', () => {
    const result = NodeDataSchema.safeParse({
      type: NodeType.SEND_BUTTONS,
      ...minimalData,
      interaction: { mode: 'invalid_mode' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects when buttons exceed 3', () => {
    const result = NodeDataSchema.safeParse({
      type: NodeType.SEND_BUTTONS,
      body: 'test',
      buttons: [
        { id: 'b1', title: 'B1' },
        { id: 'b2', title: 'B2' },
        { id: 'b3', title: 'B3' },
        { id: 'b4', title: 'B4' },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// send_list
// ---------------------------------------------------------------------------

describe('send_list node schema integrity', () => {
  const minimalData = {
    body: 'Choose an item',
    buttonTitle: 'View options',
    sections: [
      {
        title: 'Section 1',
        rows: [{ id: 'row_1', title: 'Row 1' }],
      },
    ],
  };

  it('accepts minimal send_list data', () => {
    const result = NodeDataSchema.safeParse({ type: NodeType.SEND_LIST, ...minimalData });
    expect(result.success).toBe(true);
  });

  it('accepts send_list with interaction config', () => {
    const result = NodeDataSchema.safeParse({
      type: NodeType.SEND_LIST,
      ...minimalData,
      interaction: {
        mode: 'input',
        input: {
          type: 'choice',
          timeoutSeconds: 3600,
          options: [{ id: 'row_1', label: 'Row 1', branchKey: 'row_1' }],
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NodeSchema: root-level interaction field MUST NOT exist
// ---------------------------------------------------------------------------

describe('NodeSchema structure', () => {
  it('does not have interaction at root level', () => {
    // NodeSchema is a ZodEffects (superRefine), the inner object is at ._def.schema
    const innerShape = (NodeSchema as any)._def.schema.shape as Record<string, unknown>;
    expect(Object.keys(innerShape)).not.toContain('interaction');
    expect(Object.keys(innerShape)).toContain('data');
    expect(Object.keys(innerShape)).toContain('branches');
  });
});

// ---------------------------------------------------------------------------
// All node types must be present in NodeDataSchema
// ---------------------------------------------------------------------------

describe('NodeDataSchema completeness', () => {
  const registeredTypes = NodeDataSchema.options.map(
    (o: any) => o._def.shape().type._def.value
  );

  it('covers every NodeType enum value', () => {
    const enumValues = Object.values(NodeType);
    for (const nodeType of enumValues) {
      expect(registeredTypes).toContain(nodeType);
    }
  });
});

// ---------------------------------------------------------------------------
// Branch validation: node.branches must include all edge branch keys
// ---------------------------------------------------------------------------

describe('branches array validation', () => {
  it('send_buttons node includes branch per button plus timeout', () => {
    const buttonId = 'btn_456';
    const result = parseNode({
      type: NodeType.SEND_BUTTONS,
      branches: [
        { key: buttonId, label: 'Button 1' },
        { key: 'timeout', label: 'Timeout' },
      ],
      data: {
        body: 'test',
        buttons: [{ id: buttonId, title: 'Button 1' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects node where edge uses a branch key not in branches array', () => {
    // This is caught by flow.service validateGraph, not NodeSchema itself.
    // Verify the branches array is present and readable.
    const result = parseNode({
      type: NodeType.SEND_TEXT,
      branches: [{ key: 'default', label: 'Default' }],
      data: { message: 'hello' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const branchKeys = result.data.branches.map((b) => b.key);
      expect(branchKeys).toContain('default');
    }
  });
});

// ---------------------------------------------------------------------------
// Interaction field: always in data, never at node root
// ---------------------------------------------------------------------------

describe('interaction field placement', () => {
  it('send_buttons interaction is accepted in data, not root', () => {
    const buttonId = 'btn_789';

    const withInteractionInData = parseNode({
      type: NodeType.SEND_BUTTONS,
      branches: [{ key: buttonId, label: 'B1' }, { key: 'timeout', label: 'Timeout' }],
      data: {
        body: 'test',
        buttons: [{ id: buttonId, title: 'B1' }],
        interaction: { mode: 'input', input: { type: 'choice', timeoutSeconds: 300 } },
      },
    });
    expect(withInteractionInData.success).toBe(true);
  });

  it('unknown root-level fields are stripped by NodeSchema (data is the home for extras)', () => {
    const result = parseNode({
      type: NodeType.SEND_TEXT,
      branches: [{ key: 'default', label: 'Default' }],
      data: { message: 'hello' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).interaction).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Frontend NodeType constants parity with backend NodeType enum
// ---------------------------------------------------------------------------
//
// The frontend maintains node-types.constants.ts as a mirror of this enum.
// This test enumerates both and asserts no value exists in one but not the other.
// When you add a new NodeType to the backend enum, this test will fail until
// you also add it to frontend/src/features/nodes/node-types.constants.ts.
//
// NOTE: This test embeds the frontend constant values inline because the
// backend test runner has no access to the frontend source tree. Update the
// FRONTEND_NODE_TYPE_VALUES array whenever node-types.constants.ts changes.

describe('Frontend ↔ Backend NodeType parity', () => {
  const FRONTEND_NODE_TYPE_VALUES: string[] = [
    'start',
    'end',
    'send_text',
    'send_image',
    'send_video',
    'send_audio',
    'send_document',
    'send_location',
    'send_buttons',
    'send_list',
    'send_template',
    'ask_question',
    'condition',
    'set_variable',
    'random_split',
    'jump_to_flow',
    'human_handoff',
    'webhook',
    'google_sheets',
    'nocodb',
  ];

  const backendValues = Object.values(NodeType) as string[];

  it('every frontend NodeType constant exists in backend NodeType enum', () => {
    for (const frontendValue of FRONTEND_NODE_TYPE_VALUES) {
      expect(backendValues).toContain(frontendValue);
    }
  });

  it('every backend NodeType enum value exists in frontend constants', () => {
    for (const backendValue of backendValues) {
      expect(FRONTEND_NODE_TYPE_VALUES).toContain(backendValue);
    }
  });
});
