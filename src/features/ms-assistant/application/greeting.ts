import type { BotResponse } from '../domain/bot-response';
import {
  formatWhatsAppText,
  WA_EMOJI,
} from '../infrastructure/formatter/whatsapp-format';
import type { NearMissAllowList } from '../infrastructure/llm/shared';

export type { NearMissAllowList };

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
  SURVEY: 'ms_survey',
} as const;

export const MS_SURVEY_URL =
  'https://globaleysurvey.ey.com/jfe/form/SV_1Cjy5whgPyBoH7U';

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

/**
 * Expert handoff ids — menu is by KB offering domain (not org team labels).
 * Person ids remain for alias resolution / single-contact cards.
 */
export const MS_HANDOFF_IDS = {
  // Content-backed MS offering pillars (menu)
  P_CYBER: 'ms_handoff_p_cyber',
  P_TECH: 'ms_handoff_p_tech',
  P_DATA_AI: 'ms_handoff_p_data_ai',
  P_TAX_FINANCE: 'ms_handoff_p_tax_finance',
  P_HR_PAYROLL: 'ms_handoff_p_hr_payroll',
  P_LEARNING: 'ms_handoff_p_learning',
  P_SUPPLY: 'ms_handoff_p_supply',
  P_GCC: 'ms_handoff_p_gcc',
  P_GTM: 'ms_handoff_p_gtm',
  // People
  LD_CYBER: 'ms_handoff_ld_cyber',
  LD_HR: 'ms_handoff_ld_hr',
  LD_TAX: 'ms_handoff_ld_tax',
  LD_TECHNOLOGY: 'ms_handoff_ld_technology',
  LD_DATA_AI: 'ms_handoff_ld_data_ai',
  LD_AI_BUSINESS: 'ms_handoff_ld_ai_business',
  LD_GCC_CAAS: 'ms_handoff_ld_gcc_caas',
  LD_AI_COE: 'ms_handoff_ld_ai_coe',
  LD_SR_MSL: 'ms_handoff_ld_sr_msl',
  CT_AMS: 'ms_handoff_ct_ams',
  CT_HRO: 'ms_handoff_ct_hro',
  CT_TFO: 'ms_handoff_ct_tfo',
  CT_LLM_GOV: 'ms_handoff_ct_llm_gov',
  CT_ACR_PAYROLL: 'ms_handoff_ct_acr_payroll',
  CT_PAYROLL: 'ms_handoff_ct_payroll',
  CT_MLS: 'ms_handoff_ct_mls',
  CT_CYBER: 'ms_handoff_ct_cyber',
  CT_AI_SUPPLY: 'ms_handoff_ct_ai_supply',
  CT_DATA_AI: 'ms_handoff_ct_data_ai',
  CT_DIGITAL_TAX: 'ms_handoff_ct_digital_tax',
  GTM_CORRIDOR: 'ms_handoff_gtm_corridor',
  GTM_DEAL_HUB: 'ms_handoff_gtm_deal_hub',
} as const;

type HandoffTeam = 'Leadership Team' | 'Core Team' | 'GTM Team';

type HandoffContact = {
  id: string;
  /** Specialty label within the KB pillar (for display). */
  focus: string;
  contactName: string;
  email: string;
  designation: string;
  team: HandoffTeam;
  aliases?: string[];
};

type HandoffPillar = {
  id: string;
  /** WhatsApp list title (max 24). */
  title: string;
  description: string;
  /** Full KB offering domain name. */
  kbDomain: string;
  aliases: string[];
  contactIds: string[];
};

/** Approved people directory — only listed emails may be shown. */
export const HANDOFF_CONTACTS: HandoffContact[] = [
  {
    id: MS_HANDOFF_IDS.LD_CYBER,
    focus: 'Cyber leadership',
    contactName: 'Murali Rao',
    email: 'Murali.Rao@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['murali rao'],
  },
  {
    id: MS_HANDOFF_IDS.CT_CYBER,
    focus: 'Cyber delivery',
    contactName: 'Raghavendra Bv',
    email: 'Raghavendra.Bv@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['raghavendra'],
  },
  {
    id: MS_HANDOFF_IDS.LD_TECHNOLOGY,
    focus: 'Technology leadership',
    contactName: 'Selva R.',
    email: 'Selvakumar.Rajendran@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['selva', 'selvakumar'],
  },
  {
    id: MS_HANDOFF_IDS.CT_AMS,
    focus: 'AMS | SAP',
    contactName: 'Shanthi Mani',
    email: 'Shanthi.Mani@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['shanthi', 'ams', 'sap', 'ams sap', 'jumpstart ams'],
  },
  {
    id: MS_HANDOFF_IDS.LD_DATA_AI,
    focus: 'Data & AI leadership',
    contactName: 'Alexy Thomas',
    email: 'Alexy.Thomas@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['alexy'],
  },
  {
    id: MS_HANDOFF_IDS.CT_DATA_AI,
    focus: 'Data & AI delivery',
    contactName: 'Sivakumar Moorty',
    email: 'Sivakumar.Moorty@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['sivakumar'],
  },
  {
    id: MS_HANDOFF_IDS.LD_AI_BUSINESS,
    focus: 'AI in Business',
    contactName: 'Vijay Shankar',
    email: 'bvijay.shankar@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['vijay shankar', 'ai in business'],
  },
  {
    id: MS_HANDOFF_IDS.LD_AI_COE,
    focus: 'AI COE',
    contactName: 'Hari Balaji',
    email: 'Hari.Balaji@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['hari balaji', 'ai coe', 'coe'],
  },
  {
    id: MS_HANDOFF_IDS.CT_LLM_GOV,
    focus: 'LLM Governance',
    contactName: 'Salil Shekharan',
    email: 'Salil.Shekharan@in.ey.com',
    designation: 'Partner',
    team: 'Core Team',
    aliases: ['salil', 'llm governance', 'llm'],
  },
  {
    id: MS_HANDOFF_IDS.LD_TAX,
    focus: 'Global Compliance and Reporting',
    contactName: 'Garima Pande',
    email: 'garima.pande@in.ey.com',
    designation: 'Partner and National Leader, Global Compliance and Reporting, EY India',
    team: 'Leadership Team',
    aliases: ['garima', 'gcr', 'global compliance', 'global compliance and reporting'],
  },
  {
    id: MS_HANDOFF_IDS.CT_TFO,
    focus: 'Tax and Finance Operate (TFO)',
    contactName: 'Jitesh Bansal',
    email: 'jitesh.bansal@in.ey.com',
    designation: 'Partner and National Leader, Tax and Finance Operate, EY India',
    team: 'Leadership Team',
    aliases: ['jitesh', 'tfo', 'tax and finance operate', 'finance operate'],
  },
  {
    id: MS_HANDOFF_IDS.CT_DIGITAL_TAX,
    focus: 'Digital Tax',
    contactName: 'Rahul Patni',
    email: 'rahul.patni@ey.com',
    designation: 'Partner and National Leader, Digital Tax, EY India',
    team: 'Leadership Team',
    aliases: ['rahul', 'rahul patni', 'digital tax', 'patni'],
  },
  {
    id: MS_HANDOFF_IDS.LD_HR,
    focus: 'HR leadership',
    contactName: 'Anurag Malik',
    email: 'anurag.malik@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['anurag'],
  },
  {
    id: MS_HANDOFF_IDS.CT_HRO,
    focus: 'HRO',
    contactName: 'Sanjeev Duggal',
    email: 'Sanjeev.Duggal@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['sanjeev', 'hro', 'human resources outsourcing'],
  },
  {
    id: MS_HANDOFF_IDS.CT_ACR_PAYROLL,
    focus: 'ACR & Payroll',
    contactName: 'Shobha P Keni',
    email: 'shobha.keni@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['shobha', 'acr', 'acr and payroll', 'acr & payroll'],
  },
  {
    id: MS_HANDOFF_IDS.CT_PAYROLL,
    focus: 'Payroll',
    contactName: 'Vinayak Iyer',
    email: 'vinayak.iyer@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['vinayak', 'payroll'],
  },
  {
    id: MS_HANDOFF_IDS.CT_MLS,
    focus: 'Managed Learning Services',
    contactName: 'Ashish Jain',
    email: 'Ashish.Jain7@in.ey.com',
    designation: 'Partner',
    team: 'Core Team',
    aliases: ['ashish', 'mls', 'managed learning', 'managed learning services', 'learning'],
  },
  {
    id: MS_HANDOFF_IDS.CT_AI_SUPPLY,
    focus: 'AI in Supply Chain',
    contactName: 'Sudhanshu S Singh',
    email: 'Sudhanshu3.Singh@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Core Team',
    aliases: ['sudhanshu', 'ai in supply chain', 'supply chain'],
  },
  {
    id: MS_HANDOFF_IDS.LD_GCC_CAAS,
    focus: 'GCC / CaaS',
    contactName: 'Manoj Marwah',
    email: 'manoj.marwah@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['manoj', 'gcc', 'gcc caas', 'caas', 'capability centre'],
  },
  {
    id: MS_HANDOFF_IDS.GTM_CORRIDOR,
    focus: 'Corridor',
    contactName: 'Indraneel Roy',
    email: 'Indraneel.Roy@in.ey.com',
    designation: 'Partner',
    team: 'GTM Team',
    aliases: ['indraneel', 'corridor'],
  },
  {
    id: MS_HANDOFF_IDS.GTM_DEAL_HUB,
    focus: 'Deal Hub',
    contactName: 'Partha Sinha',
    email: 'Partha.Sinha@in.ey.com',
    designation: 'Director',
    team: 'GTM Team',
    aliases: ['partha', 'deal hub'],
  },
  {
    id: MS_HANDOFF_IDS.LD_SR_MSL,
    focus: 'SR - MSL (pursuit routing)',
    contactName: 'Rakesh Kaul Punjabi',
    email: 'Rakesh.Kaul@in.ey.com',
    designation: 'Partner/Principal',
    team: 'Leadership Team',
    aliases: ['rakesh', 'sr-msl', 'sr msl', 'sr - msl'],
  },
];

/**
 * Menu pillars aligned to KB offering domains in 09-delivery-model-offerings.md
 * (+ cyber/hrms/learning/tech platform/TFO tax docs). No invented content themes.
 */
export const HANDOFF_PILLARS: HandoffPillar[] = [
  {
    id: MS_HANDOFF_IDS.P_CYBER,
    title: 'Cyber / SOC',
    description: 'SOC, TDR, cyber platforms',
    kbDomain: 'SOC and Cyber Managed Services',
    aliases: ['cyber', 'soc', 'tdr', 'cybersecurity', 'security'],
    contactIds: [MS_HANDOFF_IDS.LD_CYBER, MS_HANDOFF_IDS.CT_CYBER],
  },
  {
    id: MS_HANDOFF_IDS.P_TECH,
    title: 'Technology / AMS',
    description: 'Tech MS, AMS, SAP',
    kbDomain: 'Technology Services / AMS (incl. SAP ERP)',
    aliases: ['technology', 'tech', 'ams', 'sap', 'erp', 'oracle', 'microsoft', 'cloud', 'finops'],
    contactIds: [MS_HANDOFF_IDS.LD_TECHNOLOGY, MS_HANDOFF_IDS.CT_AMS],
  },
  {
    id: MS_HANDOFF_IDS.P_DATA_AI,
    title: 'Data and AI',
    description: 'Data ops, AI, LLM gov',
    kbDomain: 'Data and AI Managed Services',
    aliases: ['data and ai', 'data & ai', 'data ai', 'ai', 'analytics', 'llm', 'ai coe', 'ai in business'],
    contactIds: [
      MS_HANDOFF_IDS.LD_DATA_AI,
      MS_HANDOFF_IDS.CT_DATA_AI,
      MS_HANDOFF_IDS.LD_AI_BUSINESS,
      MS_HANDOFF_IDS.LD_AI_COE,
      MS_HANDOFF_IDS.CT_LLM_GOV,
    ],
  },
  {
    id: MS_HANDOFF_IDS.P_TAX_FINANCE,
    title: 'Tax and Finance',
    description: 'TFO, GCR, Digital Tax',
    kbDomain: 'Tax and Finance Managed Services',
    aliases: [
      'tax',
      'finance',
      'tfo',
      'tax and finance',
      'digital tax',
      'gcr',
      'global compliance',
      'close',
    ],
    contactIds: [
      MS_HANDOFF_IDS.CT_TFO,
      MS_HANDOFF_IDS.LD_TAX,
      MS_HANDOFF_IDS.CT_DIGITAL_TAX,
    ],
  },
  {
    id: MS_HANDOFF_IDS.P_HR_PAYROLL,
    title: 'HR and Payroll',
    description: 'HR, HRO, payroll ops',
    kbDomain: 'HR and Payroll Managed Services',
    aliases: ['hr', 'hrms', 'hro', 'payroll', 'hr and payroll', 'human resources'],
    contactIds: [
      MS_HANDOFF_IDS.LD_HR,
      MS_HANDOFF_IDS.CT_HRO,
      MS_HANDOFF_IDS.CT_ACR_PAYROLL,
      MS_HANDOFF_IDS.CT_PAYROLL,
    ],
  },
  {
    id: MS_HANDOFF_IDS.P_LEARNING,
    title: 'Managed Learning',
    description: 'MLS / learning ops',
    kbDomain: 'Managed Learning Services',
    aliases: ['managed learning', 'mls', 'learning'],
    contactIds: [MS_HANDOFF_IDS.CT_MLS],
  },
  {
    id: MS_HANDOFF_IDS.P_SUPPLY,
    title: 'Supply Chain',
    description: 'Supply chain & ops MS',
    kbDomain: 'Supply Chain and Operations',
    aliases: ['supply chain', 'ai in supply chain', 'operations ms'],
    contactIds: [MS_HANDOFF_IDS.CT_AI_SUPPLY],
  },
  {
    id: MS_HANDOFF_IDS.P_GCC,
    title: 'GCC / CaaS',
    description: 'Capability centre MS',
    kbDomain: 'Capability Centre-as-a-Service (GCC)',
    aliases: ['gcc', 'caas', 'capability centre', 'gcc caas'],
    contactIds: [MS_HANDOFF_IDS.LD_GCC_CAAS],
  },
  {
    id: MS_HANDOFF_IDS.P_GTM,
    title: 'GTM / Pursuit',
    description: 'Corridor, Deal Hub, SR-MSL',
    kbDomain: 'GTM / Pursuit routing (not an MS content theme)',
    aliases: ['gtm', 'pursuit', 'corridor', 'deal hub', 'sr-msl', 'sr msl'],
    contactIds: [
      MS_HANDOFF_IDS.GTM_CORRIDOR,
      MS_HANDOFF_IDS.GTM_DEAL_HUB,
      MS_HANDOFF_IDS.LD_SR_MSL,
    ],
  },
];

/**
 * Approved topics + named owners the model may suggest when exact KB coverage is missing.
 * Built from handoff pillars/contacts plus a few playbook-adjacent labels — never open-ended.
 */
export function buildNearMissAllowList(): NearMissAllowList {
  const topics: NearMissAllowList['topics'] = HANDOFF_PILLARS.filter(
    (p) => p.id !== MS_HANDOFF_IDS.P_GTM,
  ).map((p) => ({
    label: p.title,
    detail: p.kbDomain,
  }));

  // Playbook-adjacent labels partners commonly ask about (still closed / curated).
  topics.push(
    {
      label: 'SAP AMS',
      detail: 'Technology Services / AMS (incl. SAP ERP)',
    },
    {
      label: 'SAP AMS — planning & consolidation (SAC, BPC, Group Reporting)',
      detail: 'Adjacent Technology / AMS angle for planning/consolidation questions',
    },
    {
      label: 'Finance operations under TFO',
      detail: 'Tax and Finance Operate (TFO)',
    },
    {
      label: 'Cloud / FinOps Managed Services',
      detail: 'Technology / Cloud cost and FinOps conversation themes',
    },
    {
      label: 'Qualification lens (3 tests)',
      detail: 'Run/Operate Scope, Measurable Service Delivery, Transition Feasibility',
    },
    {
      label: 'Triggers (client signals)',
      detail: 'Capacity, quality, tech, finance/HR scale discussion themes',
    },
  );

  const owners: NearMissAllowList['owners'] = [];
  for (const pillar of HANDOFF_PILLARS) {
    if (pillar.id === MS_HANDOFF_IDS.P_GTM) continue;
    for (const cid of pillar.contactIds) {
      const c = HANDOFF_CONTACTS.find((x) => x.id === cid);
      if (!c) continue;
      owners.push({
        name: c.contactName,
        space: pillar.title,
        email: c.email,
        focus: c.focus,
      });
    }
  }

  return { topics, owners };
}

function findHandoffContact(id: string): HandoffContact | undefined {
  return HANDOFF_CONTACTS.find((c) => c.id === id);
}

function findHandoffPillar(id: string): HandoffPillar | undefined {
  return HANDOFF_PILLARS.find((p) => p.id === id);
}

function contactsForPillar(pillar: HandoffPillar): HandoffContact[] {
  return pillar.contactIds
    .map((cid) => findHandoffContact(cid))
    .filter((c): c is HandoffContact => Boolean(c));
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
        'Choose *Ask anything* for an open question, or pick a guided option below.\n' +
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
            title: 'Ask anything',
            description: 'Type a question',
          },
          {
            id: MS_BUTTON_IDS.SERVICES,
            title: 'Qualification lens',
            description: '3 tests before you position MS',
          },
          {
            id: MS_BUTTON_IDS.OFFERINGS,
            title: 'Triggers',
            description: 'Client signals worth acting on',
          },
          {
            id: MS_BUTTON_IDS.HANDOFF,
            title: 'Talk to an expert',
            description: 'Named MS contact by tower',
          },
          {
            id: MS_BUTTON_IDS.ASK,
            title: 'Run a Client diagnostic',
            description: 'Answer a few questions, get specifics',
          },
          {
            id: MS_BUTTON_IDS.SURVEY,
            title: 'Take the survey',
            description: 'Get a personalised report',
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
      `${WA_EMOJI.tip} Choose *Ask again* / *Ask anything* to query the knowledge base, or open the main menu.\n\n` +
        'Answers come only from approved knowledge sources.\n' +
        'Type *menu* anytime to return. For routing, choose *Talk to an expert*.',
    ),
    buttons: [
      { id: MS_BUTTON_IDS.TYPE_QUESTION, title: 'Ask anything' },
      { id: MS_BUTTON_IDS.HANDOFF, title: 'Talk to expert' },
      { id: MS_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' },
    ],
  };
}

/** Expert menu by KB offering domain (max 10 rows incl. Main menu). */
export function buildHandoffMenuResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.people} *Talk to an expert*\n\n` +
        'Pick a *Managed Services offering domain* from the playbook. ' +
        'Named contacts are shown only from the approved directory.',
    ),
    buttonTitle: 'MS domains',
    sections: [
      {
        title: 'MS offering domains',
        rows: [
          ...HANDOFF_PILLARS.map((p) => ({
            id: p.id,
            title: p.title.slice(0, 24),
            description: p.description.slice(0, 72),
          })),
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

/** @deprecated Team browse removed — pillars are content-backed. */
export function buildHandoffLeadershipResponse(): BotResponse {
  return buildHandoffMenuResponse();
}

/** @deprecated Team browse removed — pillars are content-backed. */
export function buildHandoffCoreResponse(): BotResponse {
  return buildHandoffMenuResponse();
}

/** @deprecated Team browse removed — pillars are content-backed. */
export function buildHandoffCoreMoreResponse(): BotResponse {
  return buildHandoffMenuResponse();
}

/** @deprecated Team browse removed — pillars are content-backed. */
export function buildHandoffGtmResponse(): BotResponse {
  return buildHandoffMenuResponse();
}

/** @deprecated */
export function buildHandoffMoreResponse(): BotResponse {
  return buildHandoffMenuResponse();
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
  // Theme-driven diagnostic (same structured options as before — Guide & Ask path).
  // Deduped: no repeat of qualification / conversation / when-not (those live under Triggers / Lens)
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} *Client diagnostic*\n\n` +
        'Pick a theme below for a structured path, or *Ask anything* for an open question.\n' +
        'Type *menu* anytime to return to the main menu.',
    ),
    buttonTitle: 'Choose',
    sections: [
      {
        title: 'Themes',
        rows: [
          {
            id: MS_BUTTON_IDS.TYPE_QUESTION,
            title: 'Ask anything',
            description: 'Open question from approved KB',
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
      `${WA_EMOJI.people} *Ask anything*\n\n` +
        'Send your question in plain text (or paste a customer statement).\n\n' +
        'Examples: who to talk to, credentials, how to position MS — I will answer *only* from the approved Managed Services knowledge base.\n\n' +
        'If nothing exact is found, I will suggest the closest Managed Services areas we already run and offer expert routing.\n\n' +
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
  return (
    `${WA_EMOJI.people} *${contact.focus}*\n\n` +
    `*Name:* ${contact.contactName}\n` +
    `*Email:* ${contact.email}\n` +
    `*Designation:* ${contact.designation}\n` +
    `*Org team:* ${contact.team}`
  );
}

function formatHandoffPillar(pillar: HandoffPillar): string {
  const people = contactsForPillar(pillar);
  const blocks = people.map(
    (c, i) =>
      `*${i + 1}. ${c.contactName}* (${c.team})\n` +
      `*Focus:* ${c.focus}\n` +
      `*Email:* ${c.email}\n` +
      `*Designation:* ${c.designation}`,
  );
  const note =
    pillar.id === MS_HANDOFF_IDS.P_GTM
      ? '\n\n_GTM / Pursuit is for deal routing — not a playbook content theme._'
      : '';
  return (
    `${WA_EMOJI.people} *${pillar.kbDomain}*\n\n` +
    '_Approved directory contacts for this MS offering:_\n\n' +
    blocks.join('\n\n') +
    note
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
    case MS_BUTTON_IDS.SURVEY:
      return (
        'Please click on below link to start the survey:\n\n' +
        MS_SURVEY_URL
      );
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
      const pillar = findHandoffPillar(id);
      if (pillar) return formatHandoffPillar(pillar);
      const contact = findHandoffContact(id);
      if (contact) return formatHandoffContact(contact);
      return undefined;
    }
  }
}

/** Match free-text to a KB offering pillar (preferred over single-person match). */
export function resolveHandoffPillarId(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;

  for (const pillar of HANDOFF_PILLARS) {
    if (pillar.id === raw.trim()) return pillar.id;
    const needles = [
      pillar.title.toLowerCase(),
      pillar.kbDomain.toLowerCase(),
      ...pillar.aliases.map((a) => a.toLowerCase()),
    ];
    if (needles.some((n) => n === key)) return pillar.id;
  }

  let best: { id: string; len: number } | undefined;
  for (const pillar of HANDOFF_PILLARS) {
    const needles = [
      pillar.title.toLowerCase(),
      pillar.kbDomain.toLowerCase(),
      ...pillar.aliases.map((a) => a.toLowerCase()),
    ];
    for (const n of needles) {
      if (n.length < 3) continue;
      if (key.includes(n) || n.includes(key)) {
        if (!best || n.length > best.len) best = { id: pillar.id, len: n.length };
      }
    }
  }
  return best?.id;
}

/** Match free-text to an approved person id (name / specialty aliases). */
export function resolveHandoffContactId(raw: string): string | undefined {
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;

  for (const contact of HANDOFF_CONTACTS) {
    if (contact.id === raw.trim()) return contact.id;
    const needles = [
      contact.focus.toLowerCase(),
      contact.contactName.toLowerCase(),
      ...(contact.aliases ?? []).map((a) => a.toLowerCase()),
    ];
    if (needles.some((n) => n === key)) return contact.id;
  }

  let best: { id: string; len: number } | undefined;
  for (const contact of HANDOFF_CONTACTS) {
    const needles = [
      contact.focus.toLowerCase(),
      contact.contactName.toLowerCase(),
      ...(contact.aliases ?? []).map((a) => a.toLowerCase()),
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
    'run a client diagnostic': MS_BUTTON_IDS.ASK,
    'client diagnostic': MS_BUTTON_IDS.ASK,
    diagnostic: MS_BUTTON_IDS.ASK,
    'ask a question': MS_BUTTON_IDS.TYPE_QUESTION,
    'ask anything': MS_BUTTON_IDS.TYPE_QUESTION,
    'take the survey': MS_BUTTON_IDS.SURVEY,
    survey: MS_BUTTON_IDS.SURVEY,
    'talk to a human': MS_BUTTON_IDS.HANDOFF,
    'talk to human': MS_BUTTON_IDS.HANDOFF,
    'talk to an expert': MS_BUTTON_IDS.HANDOFF,
    'talk to expert': MS_BUTTON_IDS.HANDOFF,
    'back to experts': MS_BUTTON_IDS.HANDOFF,
    handoff: MS_BUTTON_IDS.HANDOFF,
    contact: MS_BUTTON_IDS.HANDOFF,
    contacts: MS_BUTTON_IDS.HANDOFF,
    'human handoff': MS_BUTTON_IDS.HANDOFF,
    'leadership team': MS_BUTTON_IDS.HANDOFF,
    leadership: MS_BUTTON_IDS.HANDOFF,
    'core team': MS_BUTTON_IDS.HANDOFF,
    core: MS_BUTTON_IDS.HANDOFF,
    'more core contacts': MS_BUTTON_IDS.HANDOFF,
    'more towers': MS_BUTTON_IDS.HANDOFF,
    'gtm team': MS_HANDOFF_IDS.P_GTM,
    gtm: MS_HANDOFF_IDS.P_GTM,
    'cyber / soc': MS_HANDOFF_IDS.P_CYBER,
    cyber: MS_HANDOFF_IDS.P_CYBER,
    'technology / ams': MS_HANDOFF_IDS.P_TECH,
    'data and ai': MS_HANDOFF_IDS.P_DATA_AI,
    'tax and finance': MS_HANDOFF_IDS.P_TAX_FINANCE,
    'hr and payroll': MS_HANDOFF_IDS.P_HR_PAYROLL,
    'managed learning': MS_HANDOFF_IDS.P_LEARNING,
    'supply chain': MS_HANDOFF_IDS.P_SUPPLY,
    'gcc / caas': MS_HANDOFF_IDS.P_GCC,
    'gtm / pursuit': MS_HANDOFF_IDS.P_GTM,
    'main menu': MS_BUTTON_IDS.MAIN_MENU,
    'guide list': MS_BUTTON_IDS.FAQ,
    'browse faqs': MS_BUTTON_IDS.FAQ,
    'type my question': MS_BUTTON_IDS.TYPE_QUESTION,
    'ask again': MS_BUTTON_IDS.TYPE_QUESTION,
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
