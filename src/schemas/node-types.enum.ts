export enum NodeType {
  // Messaging Nodes
  SEND_TEXT = 'send_text',
  SEND_IMAGE = 'send_image',
  SEND_VIDEO = 'send_video',
  SEND_AUDIO = 'send_audio',
  SEND_DOCUMENT = 'send_document',
  SEND_LOCATION = 'send_location',
  SEND_BUTTONS = 'send_buttons',
  SEND_LIST = 'send_list',
  SEND_TEMPLATE = 'send_template',
  ASK_QUESTION = 'ask_question',

  // Logic Nodes
  CONDITION = 'condition',
  SET_VARIABLE = 'set_variable',
  RANDOM_SPLIT = 'random_split',

  // Flow Control Nodes
  START = 'start',
  END = 'end',
  JUMP_TO_FLOW = 'jump_to_flow',
  HUMAN_HANDOFF = 'human_handoff',

  // Integration Nodes
  WEBHOOK = 'webhook',
  GOOGLE_SHEETS = 'google_sheets',
  NOCODB = 'nocodb',
}

export const MESSAGING_NODE_TYPES = [
  NodeType.SEND_TEXT,
  NodeType.SEND_IMAGE,
  NodeType.SEND_VIDEO,
  NodeType.SEND_AUDIO,
  NodeType.SEND_DOCUMENT,
  NodeType.SEND_LOCATION,
  NodeType.SEND_BUTTONS,
  NodeType.SEND_LIST,
  NodeType.SEND_TEMPLATE,
  NodeType.ASK_QUESTION,
];

export const LOGIC_NODE_TYPES = [
  NodeType.CONDITION,
  NodeType.SET_VARIABLE,
  NodeType.RANDOM_SPLIT,
];

export const FLOW_CONTROL_NODE_TYPES = [
  NodeType.START,
  NodeType.END,
  NodeType.JUMP_TO_FLOW,
  NodeType.HUMAN_HANDOFF,
];

export const INTEGRATION_NODE_TYPES = [
  NodeType.WEBHOOK,
  NodeType.GOOGLE_SHEETS,
  NodeType.NOCODB,
];
