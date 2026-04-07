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
  SEND_STICKER = 'send_sticker',
  SEND_CAROUSEL = 'send_carousel',
  LOCATION_REQUEST = 'location_request',
  ASK_QUESTION = 'ask_question',
  ASK_FILE = 'ask_file',
  NPS = 'nps',
  SEND_CARDS = 'send_cards',
  SEND_REACTION = 'send_reaction',

  // Logic Nodes
  CONDITION = 'condition',
  SET_VARIABLE = 'set_variable',
  RANDOM_SPLIT = 'random_split',

  // Flow Control Nodes
  START = 'start',
  END = 'end',
  JUMP_TO_FLOW = 'jump_to_flow',
  HUMAN_HANDOFF = 'human_handoff',

  WEBHOOK = 'webhook',
  HTTP_REQUEST = 'http_request',
  GOOGLE_SHEETS = 'google_sheets',
  NOCODB = 'nocodb',
  LANGUAGE = 'language',
   OPENAI = 'openai',
  ELEVENLABS = 'elevenlabs',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  VARIABLE_MANAGER = 'variable_manager',
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
  NodeType.SEND_STICKER,
  NodeType.SEND_CAROUSEL,
  NodeType.LOCATION_REQUEST,
  NodeType.ASK_QUESTION,
  NodeType.ASK_FILE,
  NodeType.NPS,
  NodeType.SEND_CARDS,
  NodeType.SEND_REACTION,
];

export const LOGIC_NODE_TYPES = [
  NodeType.CONDITION,
  NodeType.SET_VARIABLE,
  NodeType.RANDOM_SPLIT,
  NodeType.VARIABLE_MANAGER,
];

export const FLOW_CONTROL_NODE_TYPES = [
  NodeType.START,
  NodeType.END,
  NodeType.JUMP_TO_FLOW,
  NodeType.HUMAN_HANDOFF,
];

export const INTEGRATION_NODE_TYPES = [
  NodeType.WEBHOOK,
  NodeType.HTTP_REQUEST,
  NodeType.GOOGLE_SHEETS,
  NodeType.NOCODB,
  NodeType.OPENAI,
  NodeType.ELEVENLABS,
  NodeType.ANTHROPIC,
  NodeType.DEEPSEEK,
];
