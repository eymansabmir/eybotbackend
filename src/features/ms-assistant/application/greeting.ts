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

/** Human handoff category ids (canned contacts — no RAG). */
export const MS_HANDOFF_IDS = {
  PRC: 'ms_handoff_prc',
  TECHNOLOGY: 'ms_handoff_technology',
  CYBER: 'ms_handoff_cyber',
  HRMS: 'ms_handoff_hrms',
  DATA_AI: 'ms_handoff_data_ai',
} as const;

export const MS_FAQ_IDS = {
  THREE_TESTS: 'ms_faq_three_tests',
  HOW_START: 'ms_faq_how_start',
  WHEN_NOT: 'ms_faq_when_not',
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
        'Recognise MS opportunities from customer statements and convert them into value-led conversations.\n\n' +
        'Type a question anytime, or choose an option:',
    ),
    buttonTitle: 'Menu',
    sections: [
      {
        title: 'Main options',
        rows: [
          {
            id: MS_BUTTON_IDS.SERVICES,
            title: 'MS Lens',
            description: '3 qualification tests',
          },
          {
            id: MS_BUTTON_IDS.OFFERINGS,
            title: 'Triggers',
            description: 'Customer discussion themes',
          },
          {
            id: MS_BUTTON_IDS.ASK,
            title: 'Guide & Ask',
            description: 'Guides or free-text question',
          },
          {
            id: MS_BUTTON_IDS.HANDOFF,
            title: 'Talk to a human',
            description: 'Named MS contacts by tower',
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
      `${WA_EMOJI.tip} Send a question in your own words, or use the menu.\n\n` +
        'For a named contact, choose *Talk to a human*.',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
      { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to human' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

export function buildHandoffMenuResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Talk to a human*\n\n` +
        'Pick the Managed Services tower. Named contacts are shown when configured; otherwise you will get PRC pursuit routing guidance.',
    ),
    buttonTitle: 'Contacts',
    sections: [
      {
        title: 'Handoff categories',
        rows: [
          {
            id: MS_HANDOFF_IDS.PRC,
            title: 'PRC / Pursuit',
            description: 'Proposal, PRC MS resources',
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
      `${WA_EMOJI.lens} *MS Qualification Lens*\n\n` +
        'Before positioning Managed Services, apply three tests:\n\n' +
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
        'Select a theme for the indication, EY conversation move, value to position, and a discovery question.',
    ),
    buttonTitle: 'Themes',
    sections: [
      {
        title: 'Playbook themes',
        rows: [
          {
            id: MS_TOPIC_IDS.QUALIFY,
            title: 'Qualification lens',
            description: '3 tests before positioning MS',
          },
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
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} *Guide & Ask*\n\n` +
        'Pick a common guide, or *Type my question*. You can also type freely anytime outside this menu.',
    ),
    buttonTitle: 'Choose',
    sections: [
      {
        title: 'Common guides',
        rows: [
          {
            id: MS_FAQ_IDS.THREE_TESTS,
            title: '3 qualification tests',
            description: 'When is MS suitable?',
          },
          {
            id: MS_FAQ_IDS.HOW_START,
            title: 'How to start',
            description: '6-step conversation',
          },
          {
            id: MS_FAQ_IDS.WHEN_NOT,
            title: 'When not to force',
            description: 'Do not push MS if…',
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
            id: MS_BUTTON_IDS.TYPE_QUESTION,
            title: 'Type my question',
            description: 'Free-text / client quote',
          },
          {
            id: MS_BUTTON_IDS.HANDOFF,
            title: 'Talk to a human',
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
      `${WA_EMOJI.people} *Ask anything*\n\n` +
        'Type a question *or paste a customer statement* (e.g. “Cloud cost is increasing…”).\n' +
        'I will answer from Managed Services knowledge when available, or with professional MS guidance.\n\n' +
        '_You can also type freely anytime from the main menu — Guide & Ask is optional._\n' +
        '_Send menu anytime to return._',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.FAQ, title: 'Guide list' },
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

const POST_NAV_BUTTONS = [
  { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to human' },
  { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
  { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
] as const;

const HANDOFF_FALLBACK =
  'A named contact is not configured for this tower yet.\n\n' +
  `For PRC / pursuit routing, reach *Sabrina Custer* (PRC USLI Managed Services Lead) at *Sabrina.Custer@ey.com*, or ask your Managed Services pursuit lead.`;

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

function formatHandoffTbd(category: string, routeWhen: string): string {
  return (
    `${WA_EMOJI.people} *${category}*\n\n` +
    `*Status:* Contact TBD\n` +
    `*Region:* India / Global\n\n` +
    `_Route when:_ ${routeWhen}\n\n` +
    HANDOFF_FALLBACK
  );
}

export function buildPostAnswerNav(): BotResponse {
  return {
    mode: 'buttons',
    text: 'What would you like to do next?',
    buttons: [...POST_NAV_BUTTONS],
  };
}

export function buildAnswerWithNav(answerText: string): BotResponse {
  const body = formatWhatsAppText(answerText).slice(0, 900);
  return {
    mode: 'buttons',
    text: formatWhatsAppText(`${body}\n\n————\n${WA_EMOJI.next} *What next?*`),
    buttons: [...POST_NAV_BUTTONS],
  };
}

/** Instant menu answers from the playbook (no Copilot). */
export function cannedAnswerForId(id: string): string | undefined {
  switch (id) {
    case MS_TOPIC_IDS.QUALIFY:
    case MS_FAQ_IDS.THREE_TESTS:
    case MS_BUTTON_IDS.SERVICES:
      return (
        `${WA_EMOJI.lens} *MS Qualification — 3 tests*\n\n` +
        `1. *Run / Operate Scope* — recurring, operable work (_not_ one-off advisory)\n` +
        '2. *Measurable Service Delivery* — KPIs, SLAs, controls, accountability\n' +
        '3. *Transition Feasibility* — scope, knowledge, access, governance can transition'
      );
    case MS_TOPIC_IDS.TECHNIQUE:
    case MS_FAQ_IDS.HOW_START:
      return (
        `${WA_EMOJI.checklist} *EY conversation technique*\n\n` +
        '1. Acknowledge the pain\n' +
        '2. Quantify the impact\n' +
        '3. Test MS suitability\n' +
        '4. Reframe resources → results\n' +
        '5. Shape the value construct\n' +
        '6. Close a practical next step (diagnostic / pilot)'
      );
    case MS_TOPIC_IDS.WHEN_NOT:
    case MS_FAQ_IDS.WHEN_NOT:
      return (
        `${WA_EMOJI.warning} *When NOT to force an MS construct*\n\n` +
        '* Purely one-off advisory/implementation\n' +
        '* Client only wants named resources under its control\n' +
        '* No recurring service / measurable output\n' +
        '* No sponsor, transition appetite, governance or funding\n' +
        '* Responsibilities must stay with client management\n' +
        '* Baseline/data insufficient to accept outcome risk'
      );
    case MS_TOPIC_IDS.CAPACITY:
      return (
        `${WA_EMOJI.chart} *Triggers — capacity & cost*\n\n` +
        'Listen for: BAU firefighting, cost cuts, skills gaps, key-person risk, volume peaks, backlog/TAT issues, demand without resources, need for predictable cost / continuous improvement.\n\n' +
        `${WA_EMOJI.tip} *Typical move:* EY-operated BAU / productivity-led MS with SLAs, scalable capacity and clear commercial bands.`
      );
    case MS_TOPIC_IDS.QUALITY:
      return (
        `${WA_EMOJI.pin} *Triggers — quality & vendors*\n\n` +
        'Listen for: quality variation, complaints, SLA-met-but-unhappy, multi-vendor with no E2E owner, poor vendor value, manual reporting, repeat incidents, recurring audit findings, fast-changing regulation.\n\n' +
        `${WA_EMOJI.tip} *Typical move:* standardize SOPs/QA, experience-led MS, service integration, control tower, RCA-led operations.`
      );
    case MS_TOPIC_IDS.TECH:
      return (
        `${WA_EMOJI.cloud} ${WA_EMOJI.shield} *Triggers — tech, cloud & cyber*\n\n` +
        'Listen for: keep-the-lights-on AMS, post-go-live instability, low tool adoption, AI pilots not scaling, spreadsheet processes, alert overload, unexplained cloud cost, downtime, data reconciliation pain.\n\n' +
        `${WA_EMOJI.tip} *Typical move:* run-and-transform AMS, platform ops, AI-enabled ops, FinOps, managed monitoring, managed data ops.`
      );
    case MS_TOPIC_IDS.SCALE:
      return (
        `${WA_EMOJI.rocket} *Triggers — finance, HR & scale*\n\n` +
        'Listen for: slow finance close, repeat HR queries, expensive 24×7, new-market scale-up, GCC build/operate uncertainty.\n\n' +
        `${WA_EMOJI.tip} *Typical move:* managed finance/employee services, follow-the-sun coverage, modular ops, BOT / managed GCC constructs.`
      );
    case MS_FAQ_IDS.COST:
      return (
        `${WA_EMOJI.chart} *Trigger:* “We need to reduce operating cost this year.”\n\n` +
        '* *Indicates:* efficiency / productivity mandate\n' +
        '* *Move:* baseline demand, effort, automation, location mix; shape productivity-led MS\n' +
        '* *Value:* predictable cost + benefits transparency\n' +
        '* *Ask:* Is priority cost alone, or also quality, controls and experience?'
      );
    case MS_FAQ_IDS.SKILLS:
      return (
        `${WA_EMOJI.people} *Trigger:* “We cannot hire or retain the required skills.”\n\n` +
        '* *Indicates:* specialist gap / unstable capacity\n' +
        '* *Move:* scalable pool of domain/tech/ops specialists (not client-by-client hiring)\n' +
        '* *Value:* scarce skills, continuity, lower key-person risk\n' +
        '* *Ask:* Which skills bottleneck delivery — recurring or seasonal?'
      );
    case MS_FAQ_IDS.CLOUD_COST:
      return (
        `${WA_EMOJI.cloud} *Trigger:* “Cloud cost is increasing, but we cannot explain why.”\n\n` +
        '* *Indicates:* weak consumption governance\n' +
        '* *Move:* continuous FinOps ops — attribution, tagging, optimization, forecasting, governance\n' +
        '* *Value:* cost transparency + ongoing optimization\n' +
        '* *Ask:* Can consumption be attributed to owners, products and environments?'
      );
    case MS_HANDOFF_IDS.PRC:
      return formatHandoffContact({
        category: 'Managed Services PRC support',
        name: 'Sabrina Custer',
        role: 'PRC USLI Managed Services Lead',
        email: 'Sabrina.Custer@ey.com',
        region: 'USLI / PRC',
        routeWhen:
          'Pursuit materials, PRC MS resources, proposal assets, or general human routing help',
      });
    case MS_HANDOFF_IDS.TECHNOLOGY:
      return formatHandoffTbd(
        'Technology Managed Services',
        'AMS, SAP, Oracle, Microsoft, Salesforce, Cloud',
      );
    case MS_HANDOFF_IDS.CYBER:
      return formatHandoffTbd(
        'Cyber Managed Services',
        'SOC, TDR, Cyber Operations, cyber platforms',
      );
    case MS_HANDOFF_IDS.HRMS:
      return formatHandoffTbd(
        'HRMS / Payroll / Learning',
        'HR helpdesk, payroll, managed learning',
      );
    case MS_HANDOFF_IDS.DATA_AI:
      return formatHandoffTbd(
        'Data and AI Managed Services',
        'AI agents, analytics, data ops, AIOps',
      );
    default:
      return undefined;
  }
}

/** RAG query strings for themes that should pull full trigger detail from KB. */
export function offeringQueryForId(id: string): string | undefined {
  switch (id) {
    case MS_TOPIC_IDS.QUALIFY:
    case MS_FAQ_IDS.THREE_TESTS:
      return 'What are the three Managed Services qualification tests?';
    case MS_TOPIC_IDS.TECHNIQUE:
    case MS_FAQ_IDS.HOW_START:
      return 'What is the recommended EY Managed Services conversation technique?';
    case MS_TOPIC_IDS.WHEN_NOT:
    case MS_FAQ_IDS.WHEN_NOT:
      return 'When should we not force a Managed Services construct?';
    case MS_TOPIC_IDS.CAPACITY:
      return 'Customer discussion triggers about BAU firefighting, operating cost, skills shortage and backlog.';
    case MS_TOPIC_IDS.QUALITY:
      return 'Customer discussion triggers about service quality, complaints, vendors and audit findings.';
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
    'our services': MS_BUTTON_IDS.SERVICES,
    triggers: MS_BUTTON_IDS.OFFERINGS,
    'browse topics': MS_BUTTON_IDS.OFFERINGS,
    'explore offerings': MS_BUTTON_IDS.OFFERINGS,
    'more triggers': MS_BUTTON_IDS.MORE_TOPICS,
    'more topics': MS_BUTTON_IDS.MORE_TOPICS,
    'guide & ask': MS_BUTTON_IDS.ASK,
    'faqs & ask': MS_BUTTON_IDS.ASK,
    'ask a question': MS_BUTTON_IDS.ASK,
    'talk to a human': MS_BUTTON_IDS.HANDOFF,
    'talk to human': MS_BUTTON_IDS.HANDOFF,
    handoff: MS_BUTTON_IDS.HANDOFF,
    contact: MS_BUTTON_IDS.HANDOFF,
    contacts: MS_BUTTON_IDS.HANDOFF,
    'human handoff': MS_BUTTON_IDS.HANDOFF,
    'prc / pursuit': MS_HANDOFF_IDS.PRC,
    'technology ms': MS_HANDOFF_IDS.TECHNOLOGY,
    'cyber ms': MS_HANDOFF_IDS.CYBER,
    'hrms / learning': MS_HANDOFF_IDS.HRMS,
    'data and ai ms': MS_HANDOFF_IDS.DATA_AI,
    'main menu': MS_BUTTON_IDS.MAIN_MENU,
    'guide list': MS_BUTTON_IDS.FAQ,
    'browse faqs': MS_BUTTON_IDS.FAQ,
    'common faqs': MS_BUTTON_IDS.FAQ,
    'type my question': MS_BUTTON_IDS.TYPE_QUESTION,
    'qualification lens': MS_TOPIC_IDS.QUALIFY,
    'capacity & cost': MS_TOPIC_IDS.CAPACITY,
    'quality & vendors': MS_TOPIC_IDS.QUALITY,
    'tech, cloud & cyber': MS_TOPIC_IDS.TECH,
    'finance, hr & scale': MS_TOPIC_IDS.SCALE,
    'conversation steps': MS_TOPIC_IDS.TECHNIQUE,
    'how to converse': MS_TOPIC_IDS.TECHNIQUE,
    'when not to force ms': MS_TOPIC_IDS.WHEN_NOT,
    '3 qualification tests': MS_FAQ_IDS.THREE_TESTS,
    'how to start': MS_FAQ_IDS.HOW_START,
    'when not to force': MS_FAQ_IDS.WHEN_NOT,
    'cost pressure trigger': MS_FAQ_IDS.COST,
    'skills shortage': MS_FAQ_IDS.SKILLS,
    'cloud cost rising': MS_FAQ_IDS.CLOUD_COST,
  };
  return aliases[key] ?? raw.trim();
}
