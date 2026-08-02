import type { BotResponse } from '../domain/bot-response';

const GREETING_WORDS = new Set(['hi', 'hello', 'hey', 'start', 'hola', 'namaste', 'menu', 'home']);

export const MS_BUTTON_IDS = {
  SERVICES: 'ms_services',
  ASK: 'ms_ask_question',
  OFFERINGS: 'ms_offerings',
  MAIN_MENU: 'ms_main_menu',
  MORE_TOPICS: 'ms_more_topics',
  TYPE_QUESTION: 'ms_type_question',
  FAQ: 'ms_faq',
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
    mode: 'buttons',
    text:
      'Welcome to the *EY Managed Services Qualification Assistant*.\n\n' +
      'This bot helps you recognize MS opportunities from customer statements and convert them into value-led conversations.\n\n' +
      'Choose an option:',
    buttons: [
      { id: MS_BUTTON_IDS.SERVICES, title: 'MS Lens' },
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
    ],
  };
}

export function buildMenuNudgeResponse(): BotResponse {
  return {
    mode: 'buttons',
    text:
      'Please use the menu to continue.\n\n' +
      'For free-text questions, choose *Guide & Ask* → *Type my question*.',
    buttons: [
      { id: MS_BUTTON_IDS.SERVICES, title: 'MS Lens' },
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
    ],
  };
}

export function buildServicesOverviewResponse(): BotResponse {
  return {
    mode: 'buttons',
    text:
      '*MS Qualification Lens*\n\n' +
      'Before positioning Managed Services, apply three tests:\n\n' +
      '1. *Run / Operate Scope* — recurring work that can be operated (not one-off advisory)\n' +
      '2. *Measurable Service Delivery* — KPIs, SLAs, controls, accountability\n' +
      '3. *Transition Feasibility* — scope, knowledge, access and governance can transition\n\n' +
      'Pick a next step:',
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
    text:
      '*Customer discussion triggers*\n\n' +
      'Select a theme. You will get the indication, EY conversation move, value to position, and a discovery question.',
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
    text:
      '*Guide & Ask*\n\n' +
      'Pick a common guide item, or *Type my question* to ask in your own words (e.g. paste a customer statement).',
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
    text:
      'You are in *Ask* mode.\n\n' +
      'Type a question *or paste a customer statement* (e.g. “Cloud cost is increasing…”).\n' +
      'I will suggest the indication, EY move, value and a discovery question.\n\n' +
      'Send *menu* anytime to return.',
    buttons: [
      { id: MS_BUTTON_IDS.FAQ, title: 'Guide list' },
      { id: MS_BUTTON_IDS.OFFERINGS, title: 'Triggers' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

const POST_NAV_BUTTONS = [
  { id: MS_BUTTON_IDS.MORE_TOPICS, title: 'More Triggers' },
  { id: MS_BUTTON_IDS.ASK, title: 'Guide & Ask' },
  { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
] as const;

export function buildPostAnswerNav(): BotResponse {
  return {
    mode: 'buttons',
    text: 'What would you like to do next?',
    buttons: [...POST_NAV_BUTTONS],
  };
}

export function buildAnswerWithNav(answerText: string): BotResponse {
  const trimmed = answerText.trim().slice(0, 900);
  return {
    mode: 'buttons',
    text: `${trimmed}\n\n————\nWhat next?`,
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
        '*MS Qualification — 3 tests*\n\n' +
        '1. *Run / Operate Scope* — recurring, operable work (not one-off advisory)\n' +
        '2. *Measurable Service Delivery* — KPIs, SLAs, controls, accountability\n' +
        '3. *Transition Feasibility* — scope, knowledge, access, governance can transition'
      );
    case MS_TOPIC_IDS.TECHNIQUE:
    case MS_FAQ_IDS.HOW_START:
      return (
        '*EY conversation technique*\n\n' +
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
        '*When NOT to force an MS construct*\n\n' +
        '• Purely one-off advisory/implementation\n' +
        '• Client only wants named resources under its control\n' +
        '• No recurring service / measurable output\n' +
        '• No sponsor, transition appetite, governance or funding\n' +
        '• Responsibilities must stay with client management\n' +
        '• Baseline/data insufficient to accept outcome risk'
      );
    case MS_TOPIC_IDS.CAPACITY:
      return (
        '*Triggers — capacity & cost*\n\n' +
        'Listen for: BAU firefighting, cost cuts, skills gaps, key-person risk, volume peaks, backlog/TAT issues, demand without resources, need for predictable cost / continuous improvement.\n\n' +
        'Typical move: EY-operated BAU / productivity-led MS with SLAs, scalable capacity and clear commercial bands.'
      );
    case MS_TOPIC_IDS.QUALITY:
      return (
        '*Triggers — quality & vendors*\n\n' +
        'Listen for: quality variation, complaints, SLA-met-but-unhappy, multi-vendor with no E2E owner, poor vendor value, manual reporting, repeat incidents, recurring audit findings, fast-changing regulation.\n\n' +
        'Typical move: standardize SOPs/QA, experience-led MS, service integration, control tower, RCA-led operations.'
      );
    case MS_TOPIC_IDS.TECH:
      return (
        '*Triggers — tech, cloud & cyber*\n\n' +
        'Listen for: keep-the-lights-on AMS, post-go-live instability, low tool adoption, AI pilots not scaling, spreadsheet processes, alert overload, unexplained cloud cost, downtime, data reconciliation pain.\n\n' +
        'Typical move: run-and-transform AMS, platform ops, AI-enabled ops, FinOps, managed monitoring, managed data ops.'
      );
    case MS_TOPIC_IDS.SCALE:
      return (
        '*Triggers — finance, HR & scale*\n\n' +
        'Listen for: slow finance close, repeat HR queries, expensive 24×7, new-market scale-up, GCC build/operate uncertainty.\n\n' +
        'Typical move: managed finance/employee services, follow-the-sun coverage, modular ops, BOT / managed GCC constructs.'
      );
    case MS_FAQ_IDS.COST:
      return (
        '*Trigger:* “We need to reduce operating cost this year.”\n\n' +
        '• *Indicates:* efficiency / productivity mandate\n' +
        '• *Move:* baseline demand, effort, automation, location mix; shape productivity-led MS\n' +
        '• *Value:* predictable cost + benefits transparency\n' +
        '• *Ask:* Is priority cost alone, or also quality, controls and experience?'
      );
    case MS_FAQ_IDS.SKILLS:
      return (
        '*Trigger:* “We cannot hire or retain the required skills.”\n\n' +
        '• *Indicates:* specialist gap / unstable capacity\n' +
        '• *Move:* scalable pool of domain/tech/ops specialists (not client-by-client hiring)\n' +
        '• *Value:* scarce skills, continuity, lower key-person risk\n' +
        '• *Ask:* Which skills bottleneck delivery — recurring or seasonal?'
      );
    case MS_FAQ_IDS.CLOUD_COST:
      return (
        '*Trigger:* “Cloud cost is increasing, but we cannot explain why.”\n\n' +
        '• *Indicates:* weak consumption governance\n' +
        '• *Move:* continuous FinOps ops — attribution, tagging, optimization, forecasting, governance\n' +
        '• *Value:* cost transparency + ongoing optimization\n' +
        '• *Ask:* Can consumption be attributed to owners, products and environments?'
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
