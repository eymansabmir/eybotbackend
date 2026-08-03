import type { BotResponse } from '../domain/bot-response';
import {
  formatWhatsAppText,
  WA_EMOJI,
} from '../infrastructure/formatter/whatsapp-format';

const GREETING_WORDS = new Set(['hi', 'hello', 'hey', 'start', 'hola', 'namaste', 'menu', 'home']);

export const MS_BUTTON_IDS = {
  SERVICES: 'ms_services',
  ASK: 'ms_ask_question',
  OFFERINGS: 'ms_offerings',
  MAIN_MENU: 'ms_main_menu',
  MORE_TOPICS: 'ms_more_topics',
  TYPE_QUESTION: 'ms_type_question',
  FAQ: 'ms_faq',
  HANDOFF: 'ms_handoff',
} as const;

/** Playbook topic ids (menu-driven). */
export const MS_TOPIC_IDS = {
  QUALIFY: 'ms_topic_qualify',
  TECHNIQUE: 'ms_topic_technique',
  WHEN_NOT: 'ms_topic_when_not',
  CAPACITY: 'ms_topic_capacity',
  QUALITY: 'ms_topic_quality',
  TECH: 'ms_topic_tech',
  SCALE: 'ms_topic_scale',
} as const;

/** Expert handoff menu / contact ids (canned — no RAG invent). */
export const MS_HANDOFF_IDS = {
  LEADERSHIP: 'ms_handoff_leadership',
  CORE: 'ms_handoff_core',
  // Leadership Team pillars
  LD_CYBER: 'ms_handoff_ld_cyber',
  LD_HR: 'ms_handoff_ld_hr',
  LD_TAX: 'ms_handoff_ld_tax',
  LD_TECHNOLOGY: 'ms_handoff_ld_technology',
  LD_DATA_AI: 'ms_handoff_ld_data_ai',
  LD_AI_BUSINESS: 'ms_handoff_ld_ai_business',
  LD_GCC_CAAS: 'ms_handoff_ld_gcc_caas',
  LD_AI_COE: 'ms_handoff_ld_ai_coe',
  LD_SR_MSL: 'ms_handoff_ld_sr_msl',
  // Core Team pillars
  CT_AMS: 'ms_handoff_ct_ams',
  CT_TFO: 'ms_handoff_ct_tfo',
  CT_AI_TAX: 'ms_handoff_ct_ai_tax',
  CT_MLS: 'ms_handoff_ct_mls',
  CT_LLM_GOV: 'ms_handoff_ct_llm_gov',
  CT_ACR_PAYROLL: 'ms_handoff_ct_acr_payroll',
  CT_PAYROLL: 'ms_handoff_ct_payroll',
  CT_HRO: 'ms_handoff_ct_hro',
  CT_DATA_AI: 'ms_handoff_ct_data_ai',
  CT_AI_SUPPLY: 'ms_handoff_ct_ai_supply',
} as const;

type HandoffTeam = 'Leadership Team' | 'Core Team';

type HandoffContact = {
  id: string;
  pillar: string;
  /** WhatsApp list row title (max 24 chars). */
  title: string;
  contactName: string;
  team: HandoffTeam;
  aliases?: string[];
  solution?: string;
};

/** Approved directory — names only; never invent emails. */
export const HANDOFF_CONTACTS: HandoffContact[] = [
  {
    id: MS_HANDOFF_IDS.LD_CYBER,
    pillar: 'Cyber',
    title: 'Cyber',
    contactName: 'Murali Rao',
    team: 'Leadership Team',
    aliases: ['cyber'],
  },
  {
    id: MS_HANDOFF_IDS.LD_HR,
    pillar: 'HR',
    title: 'HR',
    contactName: 'Anurag Malik',
    team: 'Leadership Team',
    aliases: ['hr', 'human resources'],
  },
  {
    id: MS_HANDOFF_IDS.LD_TAX,
    pillar: 'Tax',
    title: 'Tax',
    contactName: 'Garima Pande',
    team: 'Leadership Team',
    aliases: ['tax'],
  },
  {
    id: MS_HANDOFF_IDS.LD_TECHNOLOGY,
    pillar: 'Technology',
    title: 'Technology',
    contactName: 'Selva R.',
    team: 'Leadership Team',
    aliases: ['technology', 'tech'],
  },
  {
    id: MS_HANDOFF_IDS.LD_DATA_AI,
    pillar: 'Data & AI',
    title: 'Data & AI',
    contactName: 'Alexy Thomas',
    team: 'Leadership Team',
    aliases: ['data & ai', 'data and ai'],
  },
  {
    id: MS_HANDOFF_IDS.LD_AI_BUSINESS,
    pillar: 'AI in Business',
    title: 'AI in Business',
    contactName: 'Vijay Shankar',
    team: 'Leadership Team',
    aliases: ['ai in business'],
  },
  {
    id: MS_HANDOFF_IDS.LD_GCC_CAAS,
    pillar: 'GCC CaaS',
    title: 'GCC CaaS',
    contactName: 'Manoj Marwah',
    team: 'Leadership Team',
    aliases: ['gcc', 'gcc caas', 'caas'],
  },
  {
    id: MS_HANDOFF_IDS.LD_AI_COE,
    pillar: 'AI COE',
    title: 'AI COE',
    contactName: 'Hari Balaji',
    team: 'Leadership Team',
    aliases: ['ai coe', 'coe'],
  },
  {
    id: MS_HANDOFF_IDS.LD_SR_MSL,
    pillar: 'SR-MSL',
    title: 'SR-MSL',
    contactName: 'Rakesh Kaul Punjabi',
    team: 'Leadership Team',
    aliases: ['sr-msl', 'sr msl', 'msl'],
  },
  {
    id: MS_HANDOFF_IDS.CT_AMS,
    pillar: 'AMS',
    title: 'AMS / SAP',
    contactName: 'Shanthi Mani',
    team: 'Core Team',
    solution: 'SAP',
    aliases: ['ams', 'sap', 'ams sap'],
  },
  {
    id: MS_HANDOFF_IDS.CT_TFO,
    pillar: 'Tax and Finance Operate',
    title: 'Tax & Finance Operate',
    contactName: 'Jitesh Bansal',
    team: 'Core Team',
    aliases: ['tfo', 'tax and finance operate', 'tax & finance operate'],
  },
  {
    id: MS_HANDOFF_IDS.CT_AI_TAX,
    pillar: 'AI in Tax',
    title: 'AI in Tax',
    contactName: 'Nitish Jain',
    team: 'Core Team',
    aliases: ['ai in tax'],
  },
  {
    id: MS_HANDOFF_IDS.CT_MLS,
    pillar: 'Managed Learning Services',
    title: 'Managed Learning',
    contactName: 'Ashish Jain',
    team: 'Core Team',
    aliases: ['mls', 'learning', 'managed learning', 'managed learning services'],
  },
  {
    id: MS_HANDOFF_IDS.CT_LLM_GOV,
    pillar: 'LLM Governance',
    title: 'LLM Governance',
    contactName: 'Salil Shekharan',
    team: 'Core Team',
    aliases: ['llm governance', 'llm'],
  },
  {
    id: MS_HANDOFF_IDS.CT_ACR_PAYROLL,
    pillar: 'ACR and Payroll',
    title: 'ACR and Payroll',
    contactName: 'Shobha Keni',
    team: 'Core Team',
    aliases: ['acr', 'acr and payroll', 'acr payroll'],
  },
  {
    id: MS_HANDOFF_IDS.CT_PAYROLL,
    pillar: 'Payroll',
    title: 'Payroll',
    contactName: 'Vinayak Iyer',
    team: 'Core Team',
    aliases: ['payroll'],
  },
  {
    id: MS_HANDOFF_IDS.CT_HRO,
    pillar: 'HRO',
    title: 'HRO',
    contactName: 'Sanjeev Duggal',
    team: 'Core Team',
    aliases: ['hro', 'human resources outsourcing'],
  },
  {
    id: MS_HANDOFF_IDS.CT_DATA_AI,
    pillar: 'Data and AI',
    title: 'Data and AI',
    contactName: 'Sivakumar Moorty',
    team: 'Core Team',
    aliases: ['data and ai', 'data & ai', 'ai'],
  },
  {
    id: MS_HANDOFF_IDS.CT_AI_SUPPLY,
    pillar: 'AI in Supply Chain',
    title: 'AI in Supply Chain',
    contactName: 'Sudhanshu S Singh',
    team: 'Core Team',
    aliases: ['ai in supply chain', 'supply chain'],
  },
];

function contactsForTeam(team: HandoffTeam): HandoffContact[] {
  return HANDOFF_CONTACTS.filter((c) => c.team === team);
}

function findHandoffContact(id: string): HandoffContact | undefined {
  return HANDOFF_CONTACTS.find((c) => c.id === id);
}

export const MS_FAQ_IDS = {
  COST: 'ms_faq_cost',
  SKILLS: 'ms_faq_skills',
  CLOUD_COST: 'ms_faq_cloud_cost',
} as const;

export function isGreetingText(text: string | undefined | null): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase().replace(/[!?.]+$/g, '');
  return GREETING_WORDS.has(normalized);
}

export function isMenuNavText(text: string | undefined | null): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase().replace(/[!?.]+$/g, '');
  return (
    GREETING_WORDS.has(normalized) ||
    normalized === 'back' ||
    normalized === '0' ||
    normalized === 'main menu' ||
    normalized === 'cancel'
  );
}

export function buildWelcomeResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} Welcome to the *EY Managed Services Qualification Assistant*.\n\n` +
        'Recognise Managed Services (MS) opportunities from customer statements and convert them into value-led conversations.\n\n' +
        'Choose *Type my question* to ask from the approved knowledge base, or pick a guided option below.\n' +
        'Type *menu* anytime to return here.\n\n' +
        `${WA_EMOJI.next} Choose an option:`,
    ),
    buttonTitle: 'Menu',
    sections: [
      {
        title: 'Main options',
        rows: [
          {
            id: MS_BUTTON_IDS.TYPE_QUESTION,
            title: 'Type my question',
            description: 'Ask — answers from approved KB',
          },
          {
            id: MS_BUTTON_IDS.SERVICES,
            title: 'Qualification lens',
            description: '3 tests before positioning MS',
          },
          {
            id: MS_BUTTON_IDS.OFFERINGS,
            title: 'Triggers',
            description: 'Customer discussion themes',
          },
          {
            id: MS_BUTTON_IDS.ASK,
            title: 'Guide & Ask',
            description: 'Sample customer triggers',
          },
          {
            id: MS_BUTTON_IDS.HANDOFF,
            title: 'Talk to an expert',
            description: 'Named contacts by MS tower',
          },
        ],
      },
    ],
  };
}

export function buildMenuNudgeResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Choose *Ask again* / *Type my question* to query the knowledge base, or open the main menu.\n\n` +
        'Answers come only from approved knowledge sources.\n' +
        'Type *menu* anytime to return. For routing, choose *Talk to an expert*.',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.TYPE_QUESTION, title: 'Type my question' },
      { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHandoffMenuResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Talk to an expert*\n\n` +
        'Choose a team. Named contacts are shown only from the approved directory — never invented.',
    ),
    buttons: [
      { id: MS_HANDOFF_IDS.LEADERSHIP, title: 'Leadership Team' },
      { id: MS_HANDOFF_IDS.CORE, title: 'Core Team' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

/** Leadership Team pillar list (9 rows). */
export function buildHandoffLeadershipResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Leadership Team*\n\nPick a pillar to see the named contact.`,
    ),
    buttonTitle: 'Leadership',
    sections: [
      {
        title: 'Leadership Team',
        rows: contactsForTeam('Leadership Team').map((c) => ({
          id: c.id,
          title: c.title,
          description: c.contactName,
        })),
      },
    ],
  };
}

/** Core Team pillar list (10 rows — WhatsApp list max). */
export function buildHandoffCoreResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Core Team*\n\nPick a pillar to see the named contact.`,
    ),
    buttonTitle: 'Core Team',
    sections: [
      {
        title: 'Core Team',
        rows: contactsForTeam('Core Team').map((c) => ({
          id: c.id,
          title: c.title,
          description: c.contactName,
        })),
      },
    ],
  };
}

/** @deprecated Use buildHandoffCoreResponse — kept for older button ids. */
export function buildHandoffMoreResponse(): BotResponse {
  return buildHandoffCoreResponse();
}

export function buildServicesOverviewResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.lens} *Managed Services qualification lens*\n\n` +
        'Before positioning Managed Services (MS), apply three tests:\n\n' +
        `1. *Run / Operate Scope* — recurring work that can be operated (_not_ one-off advisory)\n` +
        '2. *Measurable Service Delivery* — KPIs, SLAs, controls, accountability\n' +
        '3. *Transition Feasibility* — scope, knowledge, access and governance can transition\n\n' +
        `${WA_EMOJI.next} Pick a next step:`,
    ),
    buttons: [
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_TOPIC_IDS.TECHNIQUE, title: 'How to converse' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildOfferingsResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.pin} *Customer discussion triggers*\n\n` +
        'Each theme returns *Meaning*, *EY offer*, *Value*, and a *Discovery question* from the playbook.',
    ),
    buttonTitle: 'Themes',
    sections: [
      {
        title: 'Playbook themes',
        rows: [
          {
            id: MS_TOPIC_IDS.CAPACITY,
            title: 'Capacity & cost',
            description: 'BAU, cost, skills, backlog',
          },
          {
            id: MS_TOPIC_IDS.QUALITY,
            title: 'Quality & vendors',
            description: 'SLA, complaints, multi-vendor',
          },
          {
            id: MS_TOPIC_IDS.TECH,
            title: 'Tech, cloud & cyber',
            description: 'AMS, FinOps, security, data',
          },
          {
            id: MS_TOPIC_IDS.SCALE,
            title: 'Finance, HR & scale',
            description: 'Close, HR, 24x7, GCC',
          },
          {
            id: MS_TOPIC_IDS.TECHNIQUE,
            title: 'Conversation steps',
            description: '6-step EY technique',
          },
          {
            id: MS_TOPIC_IDS.WHEN_NOT,
            title: 'When NOT to force MS',
            description: 'Avoid wrong MS constructs',
          },
          {
            id: MS_TOPIC_IDS.QUALIFY,
            title: 'Qualification lens',
            description: '3 tests before positioning',
          },
          {
            id: MS_BUTTON_IDS.MAIN_MENU,
            title: 'Main menu',
            description: 'Back to start',
          },
        ],
      },
    ],
  };
}

export function buildFaqMenuResponse(): BotResponse {
  // Deduped: no repeat of qualification / conversation / when-not (those live under Triggers / Lens)
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} *Guide & Ask*\n\n` +
        'Sample customer triggers, or *Type my question*. You can also type freely anytime — answers only from approved knowledge.\n' +
        'Type *menu* anytime to return to the main menu.',
    ),
    buttonTitle: 'Choose',
    sections: [
      {
        title: 'Ask',
        rows: [
          {
            id: MS_BUTTON_IDS.TYPE_QUESTION,
            title: 'Type my question',
            description: 'Free-text from approved KB only',
          },
          {
            id: MS_FAQ_IDS.COST,
            title: 'Cost pressure trigger',
            description: 'Reduce operating cost',
          },
          {
            id: MS_FAQ_IDS.SKILLS,
            title: 'Skills shortage',
            description: 'Cannot hire/retain',
          },
          {
            id: MS_FAQ_IDS.CLOUD_COST,
            title: 'Cloud cost rising',
            description: 'FinOps conversation',
          },
          {
            id: MS_BUTTON_IDS.OFFERINGS,
            title: 'All trigger themes',
            description: 'Capacity, quality, tech, scale',
          },
          {
            id: MS_BUTTON_IDS.HANDOFF,
            title: 'Talk to an expert',
            description: 'Named MS contacts',
          },
          {
            id: MS_BUTTON_IDS.MAIN_MENU,
            title: 'Main menu',
            description: 'Back to start',
          },
        ],
      },
    ],
  };
}

export function buildAskPromptResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Type my question*\n\n` +
        'Send your question in plain text (or paste a customer statement).\n\n' +
        'I will answer *only* from the approved Managed Services knowledge base, in a short structured format.\n\n' +
        'If nothing relevant is found, you will see:\n' +
        '_Information not available in the approved knowledge source._\n\n' +
        '_Type *menu* anytime to return to the main menu._',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

const POST_NAV_BUTTONS = [
  { id: MS_BUTTON_IDS.TYPE_QUESTION, title: 'Ask again' },
  { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
  { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
] as const;

function formatHandoffContact(contact: HandoffContact): string {
  const solutionLine = contact.solution ? `\n*Solution:* ${contact.solution}` : '';
  const aliasLine =
    contact.aliases?.length && contact.aliases.some((a) => a.toLowerCase() !== contact.pillar.toLowerCase())
      ? `\n*Also route for:* ${contact.aliases.join(', ')}`
      : '';
  return (
    `${WA_EMOJI.people} *${contact.pillar}*\n\n` +
    `*Contact:* ${contact.contactName}\n` +
    `*Team:* ${contact.team}` +
    solutionLine +
    aliasLine
  );
}

/** Truncate at sentence boundary for WhatsApp button body (~1024). */
export function truncateWhatsAppBody(text: string, max = 900): string {
  const t = formatWhatsAppText(text).trim();
  if (t.length <= max) return t;
  const sliced = t.slice(0, max);
  const stops = ['. ', '.\n', '! ', '? ', '.\r'];
  let cut = -1;
  for (const s of stops) {
    cut = Math.max(cut, sliced.lastIndexOf(s));
  }
  if (cut > max * 0.55) {
    return `${sliced.slice(0, cut + 1).trim()}\n\n_(Ask a follow-up or open Triggers for more.)_`;
  }
  return `${sliced.replace(/\s+\S*$/, '').trim()}…`;
}

export function buildPostAnswerNav(): BotResponse {
  return {
    mode: 'buttons',
    text: 'What would you like to do next?',
    buttons: [...POST_NAV_BUTTONS],
  };
}

export function buildAnswerWithNav(answerText: string): BotResponse {
  const body = truncateWhatsAppBody(answerText, 880);
  return {
    mode: 'buttons',
    text: formatWhatsAppText(`${body}\n\n————\n${WA_EMOJI.next} *What next?*`),
    buttons: [...POST_NAV_BUTTONS],
  };
}

function fourPartTrigger(opts: {
  title: string;
  example: string;
  meaning: string;
  offer: string;
  value: string;
  ask: string;
  talkTrack?: string;
  alsoListen?: string;
}): string {
  const opener =
    opts.talkTrack ??
    `I hear that — “${opts.example}” Often that points to a Managed Services conversation. ${opts.ask}`;
  return (
    `${WA_EMOJI.pin} *${opts.title}*\n\n` +
    `*Example:* “${opts.example}”\n\n` +
    `* *Meaning:* ${opts.meaning}\n` +
    `* *EY offer:* ${opts.offer}\n` +
    `* *Value:* ${opts.value}\n` +
    `* *Discovery question:* ${opts.ask}\n` +
    `* *Client-facing opener:* ${opener}` +
    (opts.alsoListen ? `\n\n_Also listen for:_ ${opts.alsoListen}` : '')
  );
}

/** Instant menu answers from the playbook (no Copilot). */
export function cannedAnswerForId(id: string): string | undefined {
  switch (id) {
    case MS_TOPIC_IDS.QUALIFY:
    case MS_BUTTON_IDS.SERVICES:
      return (
        `${WA_EMOJI.lens} *Managed Services qualification — 3 tests*\n\n` +
        `1. *Run / Operate Scope* — recurring, operable work (_not_ one-off advisory)\n` +
        '2. *Measurable Service Delivery* — KPIs, SLAs, controls, accountability\n' +
        '3. *Transition Feasibility* — scope, knowledge, access, governance can transition\n\n' +
        'Only when these tests are satisfied should EY shape a Managed Services construct.'
      );
    case MS_TOPIC_IDS.TECHNIQUE:
      return (
        `${WA_EMOJI.checklist} *EY Managed Services conversation technique*\n\n` +
        '1. Acknowledge the pain\n' +
        '2. Quantify the impact\n' +
        '3. Test Managed Services suitability\n' +
        '4. Reframe resources → results\n' +
        '5. Shape the value construct\n' +
        '6. Close a practical next step (diagnostic / pilot)'
      );
    case MS_TOPIC_IDS.WHEN_NOT:
      return (
        `${WA_EMOJI.warning} *When NOT to force a Managed Services construct*\n\n` +
        '* Purely one-off advisory/implementation\n' +
        '* Client only wants named resources under its control\n' +
        '* No recurring service / measurable output\n' +
        '* No sponsor, transition appetite, governance or funding\n' +
        '* Responsibilities must stay with client management\n' +
        '* Baseline/data insufficient to accept outcome risk'
      );
    case MS_TOPIC_IDS.CAPACITY:
      return fourPartTrigger({
        title: 'Triggers — capacity & cost',
        example: 'Our team spends most of its time on BAU and firefighting.',
        meaning: 'Recurring operations are consuming strategic capacity.',
        offer:
          'EY-operated BAU service with defined scope, SLAs, governance, automation and continuous improvement.',
        value: 'Release retained capacity; improve discipline and predictability.',
        ask: 'Which recurring activities consume the most capacity, and what strategic work is being delayed?',
        alsoListen: 'cost cuts, skills gaps, key-person risk, volume peaks, backlog/TAT, predictable cost needs.',
      });
    case MS_TOPIC_IDS.QUALITY:
      return fourPartTrigger({
        title: 'Triggers — quality & vendors',
        example: 'Service quality varies by location, team or vendor.',
        meaning: 'Fragmented processes and inconsistent controls.',
        offer: 'Standardise SOPs, QA controls, training, service levels and central governance.',
        value: 'Consistent quality, fewer errors and improved visibility.',
        ask: 'Where is variation highest, and is quality measured consistently?',
        alsoListen:
          'complaints/escalations, SLA-met-but-unhappy, multi-vendor with no end-to-end owner, poor vendor value visibility, manual reporting, repeat incidents.',
      });
    case MS_TOPIC_IDS.TECH:
      return fourPartTrigger({
        title: 'Triggers — tech, cloud & cyber',
        example: 'Our application team only has time to keep the lights on.',
        meaning: 'Technical debt and innovation backlog under run-the-business pressure.',
        offer:
          'Run-and-transform Application Management Services covering operations, engineering, backlog reduction, automation and modernization.',
        value: 'Stability plus capacity for innovation.',
        ask: 'How much capacity is spent on incidents versus enhancements and modernization?',
        alsoListen:
          'post-go-live instability, low tool adoption, AI pilots not scaling, spreadsheet processes, alert overload, unexplained cloud cost, downtime, data reconciliation pain.',
      });
    case MS_TOPIC_IDS.SCALE:
      return fourPartTrigger({
        title: 'Triggers — finance, HR & scale',
        example: 'Finance spends too much time on reconciliations and close.',
        meaning: 'Transactional effort and manual close activities.',
        offer:
          'Managed finance operations covering processing, reconciliation, reporting, controls and optimization.',
        value: 'Faster close, reduced effort and improved control.',
        ask: 'Which close activities are most labour-intensive, late or error-prone?',
        alsoListen:
          'repeat HR queries, expensive 24×7 coverage, new-market scale-up, GCC build/operate uncertainty. (Business Outcome Transformation / managed GCC constructs where appropriate.)',
      });
    case MS_FAQ_IDS.COST:
      return fourPartTrigger({
        title: 'Cost pressure trigger',
        example: 'We need to reduce operating cost this year.',
        meaning: 'Immediate efficiency or productivity mandate.',
        offer:
          'Baseline demand, effort, automation potential, location mix and unit cost; shape a productivity-led Managed Services construct.',
        value: 'Predictable cost, productivity improvement and benefits transparency.',
        ask: 'Is the priority cost alone, or must service quality, controls and experience also improve?',
      });
    case MS_FAQ_IDS.SKILLS:
      return fourPartTrigger({
        title: 'Skills shortage trigger',
        example: 'We cannot hire or retain the required skills.',
        meaning: 'Specialist capability gap or unstable capacity.',
        offer:
          'Access to a scalable pool of domain, technology and operational specialists rather than client-by-client hiring.',
        value: 'Scarce skills, continuity and lower key-person dependency.',
        ask: 'Which skills create delivery bottlenecks, and are the needs recurring or seasonal?',
      });
    case MS_FAQ_IDS.CLOUD_COST:
      return fourPartTrigger({
        title: 'Cloud cost trigger',
        example: 'Cloud cost is increasing, but we cannot explain why.',
        meaning: 'Weak consumption governance and optimization.',
        offer:
          'Continuous FinOps operations covering attribution, tagging, optimization, forecasting and governance.',
        value: 'Cost transparency and continuous optimization.',
        ask: 'Can consumption be attributed to business owners, products and environments?',
      });
    default: {
      const contact = findHandoffContact(id);
      if (contact) return formatHandoffContact(contact);
      return undefined;
    }
  }
}

/** Match free-text / list titles to an approved handoff contact id. */
export function resolveHandoffContactId(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;

  for (const contact of HANDOFF_CONTACTS) {
    if (contact.id === raw.trim()) return contact.id;
    const needles = [
      contact.pillar.toLowerCase(),
      contact.title.toLowerCase(),
      ...(contact.aliases ?? []).map((a) => a.toLowerCase()),
      ...(contact.solution ? [contact.solution.toLowerCase()] : []),
    ];
    if (needles.some((n) => n === key || key === n)) return contact.id;
  }

  // Prefer longer / more specific alias contains matches (e.g. "ams sap" before "ai").
  let best: { id: string; len: number } | undefined;
  for (const contact of HANDOFF_CONTACTS) {
    const needles = [
      contact.pillar.toLowerCase(),
      contact.title.toLowerCase(),
      ...(contact.aliases ?? []).map((a) => a.toLowerCase()),
      ...(contact.solution ? [contact.solution.toLowerCase()] : []),
    ];
    for (const n of needles) {
      if (n.length < 3) continue;
      if (key.includes(n) || n.includes(key)) {
        if (!best || n.length > best.len) best = { id: contact.id, len: n.length };
      }
    }
  }
  return best?.id;
}

/** RAG query strings for themes that should pull full trigger detail from KB. */
export function offeringQueryForId(id: string): string | undefined {
  switch (id) {
    case MS_TOPIC_IDS.QUALIFY:
      return 'What are the three Managed Services qualification tests?';
    case MS_TOPIC_IDS.TECHNIQUE:
      return 'What is the recommended EY Managed Services conversation technique?';
    case MS_TOPIC_IDS.WHEN_NOT:
      return 'When should we not force a Managed Services construct?';
    case MS_TOPIC_IDS.CAPACITY:
      return 'Customer discussion triggers about BAU firefighting, operating cost, skills shortage and backlog.';
    case MS_TOPIC_IDS.QUALITY:
      return 'Customer discussion triggers about service quality, complaints, and multi-vendor ownership.';
    case MS_TOPIC_IDS.TECH:
      return 'Customer discussion triggers about applications, cloud cost, security alerts and data quality.';
    case MS_TOPIC_IDS.SCALE:
      return 'Customer discussion triggers about finance close, HR queries, 24x7 support and GCC.';
    case MS_FAQ_IDS.COST:
      return 'Customer says we need to reduce operating cost this year — Managed Services conversation move.';
    case MS_FAQ_IDS.SKILLS:
      return 'Customer cannot hire or retain required skills — Managed Services conversation move.';
    case MS_FAQ_IDS.CLOUD_COST:
      return 'Cloud cost is increasing but we cannot explain why — FinOps Managed Services move.';
    default:
      return undefined;
  }
}

export function resolveMenuSelection(raw: string): string {
  const key = raw.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'ms lens': MS_BUTTON_IDS.SERVICES,
    'qualification lens': MS_TOPIC_IDS.QUALIFY,
    'our services': MS_BUTTON_IDS.SERVICES,
    triggers: MS_BUTTON_IDS.OFFERINGS,
    'browse topics': MS_BUTTON_IDS.OFFERINGS,
    'explore offerings': MS_BUTTON_IDS.OFFERINGS,
    'all trigger themes': MS_BUTTON_IDS.OFFERINGS,
    'more triggers': MS_BUTTON_IDS.MORE_TOPICS,
    'more topics': MS_BUTTON_IDS.MORE_TOPICS,
    'guide & ask': MS_BUTTON_IDS.ASK,
    'faqs & ask': MS_BUTTON_IDS.ASK,
    'ask a question': MS_BUTTON_IDS.ASK,
    'talk to a human': MS_BUTTON_IDS.HANDOFF,
    'talk to human': MS_BUTTON_IDS.HANDOFF,
    'talk to an expert': MS_BUTTON_IDS.HANDOFF,
    'talk to expert': MS_BUTTON_IDS.HANDOFF,
    'back to experts': MS_BUTTON_IDS.HANDOFF,
    handoff: MS_BUTTON_IDS.HANDOFF,
    contact: MS_BUTTON_IDS.HANDOFF,
    contacts: MS_BUTTON_IDS.HANDOFF,
    'human handoff': MS_BUTTON_IDS.HANDOFF,
    'leadership team': MS_HANDOFF_IDS.LEADERSHIP,
    leadership: MS_HANDOFF_IDS.LEADERSHIP,
    'core team': MS_HANDOFF_IDS.CORE,
    core: MS_HANDOFF_IDS.CORE,
    'more towers': MS_HANDOFF_IDS.CORE,
    'main menu': MS_BUTTON_IDS.MAIN_MENU,
    'guide list': MS_BUTTON_IDS.FAQ,
    'browse faqs': MS_BUTTON_IDS.FAQ,
    'type my question': MS_BUTTON_IDS.TYPE_QUESTION,
    'capacity & cost': MS_TOPIC_IDS.CAPACITY,
    'quality & vendors': MS_TOPIC_IDS.QUALITY,
    'tech, cloud & cyber': MS_TOPIC_IDS.TECH,
    'finance, hr & scale': MS_TOPIC_IDS.SCALE,
    'conversation steps': MS_TOPIC_IDS.TECHNIQUE,
    'how to converse': MS_TOPIC_IDS.TECHNIQUE,
    'when not to force ms': MS_TOPIC_IDS.WHEN_NOT,
    'cost pressure trigger': MS_FAQ_IDS.COST,
    'skills shortage': MS_FAQ_IDS.SKILLS,
    'cloud cost rising': MS_FAQ_IDS.CLOUD_COST,
  };
  return aliases[key] ?? raw.trim();
}
