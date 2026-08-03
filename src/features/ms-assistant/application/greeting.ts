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

/** Expert handoff category ids (canned contacts — no RAG invent). */
export const MS_HANDOFF_IDS = {
  PRC_INDIA: 'ms_handoff_prc_india',
  PRC: 'ms_handoff_prc',
  TECHNOLOGY: 'ms_handoff_technology',
  CYBER: 'ms_handoff_cyber',
  HRMS: 'ms_handoff_hrms',
  LEARNING: 'ms_handoff_learning',
  DATA_AI: 'ms_handoff_data_ai',
  TAX: 'ms_handoff_tax',
  FINANCE: 'ms_handoff_finance',
  SUPPLY: 'ms_handoff_supply',
  RISK: 'ms_handoff_risk',
  MORE: 'ms_handoff_more',
} as const;

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
        'Type a question anytime (answers only from approved knowledge). You can type *menu* anytime to return here.\n\n' +
        `${WA_EMOJI.next} Or choose an option:`,
    ),
    buttonTitle: 'Menu',
    sections: [
      {
        title: 'Main options',
        rows: [
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
            description: 'Sample triggers or type a question',
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
      `${WA_EMOJI.tip} Type a question in your own words, or use the menu.\n\n` +
        'Answers come only from approved knowledge sources.\n' +
        'Type *menu* anytime to return. For routing, choose *Talk to an expert*.',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
      { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHandoffMenuResponse(): BotResponse {
  // WhatsApp list max 10 rows total
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Talk to an expert*\n\n` +
        'Pick a Managed Services tower. Named contacts are shown only when configured in the approved directory — never invented.',
    ),
    buttonTitle: 'Contacts',
    sections: [
      {
        title: 'Expert routing',
        rows: [
          {
            id: MS_HANDOFF_IDS.PRC_INDIA,
            title: 'India PRC / Pursuit',
            description: 'India pursuit / proposal support',
          },
          {
            id: MS_HANDOFF_IDS.PRC,
            title: 'USLI PRC / Pursuit',
            description: 'USLI PRC MS resources',
          },
          {
            id: MS_HANDOFF_IDS.TECHNOLOGY,
            title: 'Technology MS',
            description: 'AMS, SAP, Oracle, Cloud',
          },
          {
            id: MS_HANDOFF_IDS.CYBER,
            title: 'Cyber MS',
            description: 'SOC, TDR, cyber platforms',
          },
          {
            id: MS_HANDOFF_IDS.HRMS,
            title: 'HRMS / Learning',
            description: 'HR helpdesk, payroll, MLS',
          },
          {
            id: MS_HANDOFF_IDS.DATA_AI,
            title: 'Data and AI MS',
            description: 'AI agents, analytics, AIOps',
          },
          {
            id: MS_HANDOFF_IDS.TAX,
            title: 'Tax Operate',
            description: 'Tax managed services',
          },
          {
            id: MS_HANDOFF_IDS.FINANCE,
            title: 'Finance Operate',
            description: 'Finance MS / operate',
          },
          {
            id: MS_HANDOFF_IDS.MORE,
            title: 'More towers',
            description: 'Supply chain, risk & more',
          },
        ],
      },
    ],
  };
}

/** Secondary handoff list for towers that did not fit the 10-row primary list. */
export function buildHandoffMoreResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(`${WA_EMOJI.people} *Talk to an expert — more towers*`),
    buttonTitle: 'More towers',
    sections: [
      {
        title: 'More towers',
        rows: [
          {
            id: MS_HANDOFF_IDS.SUPPLY,
            title: 'Supply Chain & Ops',
            description: 'Supply chain / operations MS',
          },
          {
            id: MS_HANDOFF_IDS.RISK,
            title: 'Risk & Compliance',
            description: 'Digital risk / compliance MS',
          },
          {
            id: MS_BUTTON_IDS.HANDOFF,
            title: 'Back to experts',
            description: 'Primary tower list',
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
      `${WA_EMOJI.people} *Ask from approved knowledge*\n\n` +
        'Type a question *or paste a customer statement*.\n\n' +
        'Answers are only provided when information exists in approved knowledge sources. Otherwise you will see: _Information not available in the approved knowledge source._\n\n' +
        '_You can type freely anytime — this screen is optional. Type menu to return._',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.FAQ, title: 'Guide list' },
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

const POST_NAV_BUTTONS = [
  { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
  { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
  { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
] as const;

const HANDOFF_FALLBACK =
  'A named contact is not configured for this tower in the approved directory yet.\n\n' +
  'Ask your Managed Services pursuit lead to route you. For *USLI PRC* pursuit materials only, ' +
  'Sabrina Custer (PRC USLI Managed Services Lead) is listed at *Sabrina.Custer@ey.com*.';

function formatHandoffContact(opts: {
  category: string;
  name: string;
  role: string;
  email: string;
  region: string;
  routeWhen: string;
}): string {
  return (
    `${WA_EMOJI.people} *${opts.category}*\n\n` +
    `*Name:* ${opts.name}\n` +
    `*Role:* ${opts.role}\n` +
    `*Email:* ${opts.email}\n` +
    `*Region:* ${opts.region}\n\n` +
    `_Route when:_ ${opts.routeWhen}`
  );
}

function formatHandoffTbd(category: string, routeWhen: string, region = 'India / Global'): string {
  return (
    `${WA_EMOJI.people} *${category}*\n\n` +
    `*Status:* Contact TBD (not in approved directory)\n` +
    `*Region:* ${region}\n\n` +
    `_Route when:_ ${routeWhen}\n\n` +
    HANDOFF_FALLBACK
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
    case MS_HANDOFF_IDS.PRC:
      return formatHandoffContact({
        category: 'USLI PRC / Pursuit',
        name: 'Sabrina Custer',
        role: 'PRC USLI Managed Services Lead',
        email: 'Sabrina.Custer@ey.com',
        region: 'USLI / PRC',
        routeWhen: 'USLI pursuit materials, PRC Managed Services resources, proposal assets',
      });
    case MS_HANDOFF_IDS.PRC_INDIA:
      return formatHandoffTbd(
        'India PRC / Pursuit',
        'India pursuit materials, proposal assets, India Managed Services resources',
        'India',
      );
    case MS_HANDOFF_IDS.TECHNOLOGY:
      return formatHandoffContact({
        category: 'Technology Managed Services',
        name: 'Milan Sheth',
        role: 'EY Global Technology Managed Services Leader',
        email: 'milan.sheth@in.ey.com',
        region: 'India / Global',
        routeWhen: 'Tech Operations, AMS, SAP, Oracle, Microsoft, Salesforce, Cloud (service code 11182)',
      });
    case MS_HANDOFF_IDS.CYBER:
      return formatHandoffContact({
        category: 'Cyber Managed Services',
        name: 'Tapan Shah',
        role: 'Global Cybersecurity Managed Services Leader',
        email: 'tapan.shah@ey.com',
        region: 'Global / India',
        routeWhen: 'Cyber Operations, SOC, TDR, cyber platforms (service code 111822)',
      });
    case MS_HANDOFF_IDS.LEARNING:
      return formatHandoffContact({
        category: 'Learning Managed Services',
        name: 'Savvas Koufou',
        role: 'EY Global Managed Learning Services Leader',
        email: 'Savvas.Koufou@uk.ey.com',
        region: 'Global',
        routeWhen: 'Managed Learning Services',
      });
    case MS_HANDOFF_IDS.HRMS:
      return (
        `${WA_EMOJI.people} *HRMS / Learning*\n\n` +
        `*Managed Learning Services*\n` +
        `*Name:* Savvas Koufou\n` +
        `*Role:* EY Global Managed Learning Services Leader\n` +
        `*Email:* Savvas.Koufou@uk.ey.com\n` +
        `*Region:* Global\n\n` +
        `*HRMS / Payroll*\n` +
        `*Status:* Contact TBD (not in approved directory)\n\n` +
        `_Route when:_ HR helpdesk, payroll, employee-service ops, Managed Learning Services\n\n` +
        'For HRMS/payroll routing, ask your Managed Services pursuit lead until a named owner is added.'
      );
    case MS_HANDOFF_IDS.DATA_AI:
      return formatHandoffTbd(
        'Data and AI Managed Services',
        'AI agents, analytics, data ops, AIOps',
      );
    case MS_HANDOFF_IDS.TAX:
      return formatHandoffContact({
        category: 'Tax Operate',
        name: 'Stuart Lang',
        role: 'Global TFO Leader',
        email: 'slang1@uk.ey.com',
        region: 'Global',
        routeWhen: 'Tax managed services / Tax Operate (TFO, service code 10691)',
      });
    case MS_HANDOFF_IDS.FINANCE:
      return formatHandoffContact({
        category: 'Finance Operate',
        name: 'Stuart Lang',
        role: 'Global TFO Leader',
        email: 'slang1@uk.ey.com',
        region: 'Global',
        routeWhen: 'Finance managed services / Finance Operate (TFO, service code 10691)',
      });
    case MS_HANDOFF_IDS.SUPPLY:
      return formatHandoffTbd(
        'Supply Chain and Operations',
        'Supply chain and operations Managed Services',
      );
    case MS_HANDOFF_IDS.RISK:
      return formatHandoffTbd(
        'Risk and Compliance',
        'Digital risk, risk and compliance Managed Services',
      );
    default:
      return undefined;
  }
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
    'more towers': MS_HANDOFF_IDS.MORE,
    'back to experts': MS_BUTTON_IDS.HANDOFF,
    handoff: MS_BUTTON_IDS.HANDOFF,
    contact: MS_BUTTON_IDS.HANDOFF,
    contacts: MS_BUTTON_IDS.HANDOFF,
    'human handoff': MS_BUTTON_IDS.HANDOFF,
    'india prc / pursuit': MS_HANDOFF_IDS.PRC_INDIA,
    'usli prc / pursuit': MS_HANDOFF_IDS.PRC,
    'prc / pursuit': MS_HANDOFF_IDS.PRC,
    'technology ms': MS_HANDOFF_IDS.TECHNOLOGY,
    'cyber ms': MS_HANDOFF_IDS.CYBER,
    'hrms / payroll': MS_HANDOFF_IDS.HRMS,
    'hrms / learning': MS_HANDOFF_IDS.HRMS,
    'managed learning': MS_HANDOFF_IDS.LEARNING,
    'data and ai ms': MS_HANDOFF_IDS.DATA_AI,
    'tax operate': MS_HANDOFF_IDS.TAX,
    'finance operate': MS_HANDOFF_IDS.FINANCE,
    'supply chain & ops': MS_HANDOFF_IDS.SUPPLY,
    'risk & compliance': MS_HANDOFF_IDS.RISK,
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
