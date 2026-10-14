import type { BotResponse } from '../domain/bot-response';
import {
  formatWhatsAppText,
  WA_EMOJI,
} from '../infrastructure/formatter/whatsapp-format';
import type { NearMissAllowList } from '../infrastructure/llm/shared';

export const HR_BUTTON_IDS = {
  MAIN_MENU: 'hr_main_menu',
  TYPE_QUESTION: 'hr_ask',
  ELIGIBILITY: 'hr_eligibility',
  APPLY: 'hr_apply',
  DOCUMENTS: 'hr_documents',
  LIMITS: 'hr_limits',
  LEAVE: 'hr_leave',
  MATERNITY: 'hr_maternity',
  PATERNITY: 'hr_paternity',
  HOLIDAYS: 'hr_holidays',
  STUDY_LEAVE: 'hr_study_leave',
  FLEXI: 'hr_flexi',
  FLEXI_TIME: 'hr_flexi_time',
  PART_TIME: 'hr_part_time',
  WFH: 'hr_wfh',
  DAYCARE: 'hr_daycare',
  HEALTH: 'hr_health',
  MEDICAL: 'hr_medical',
  BENEVOLENCE: 'hr_benevolence',
  COMPENSATION: 'hr_compensation',
  IJP: 'hr_ijp',
  EOP: 'hr_eop',
} as const;

export type HrAction = {
  id: string;
  title: string;
  hint: string;
  /** When omitted, action is navigation-only and must not be suggested as a policy option. */
  keywords?: RegExp;
};

/** Closed catalog — every tappable next step must exist here and in the knowledge base. */
export const HR_ACTION_CATALOG: HrAction[] = [
  {
    id: HR_BUTTON_IDS.ELIGIBILITY,
    title: 'Am I eligible?',
    hint: 'Eligibility for the current people-policy topic',
    keywords: /eligib|who (can|is|are)|applicable|am i (allowed|covered|eligible)/i,
  },
  {
    id: HR_BUTTON_IDS.APPLY,
    title: 'How to apply',
    hint: 'Application, claim, booking, or submission steps',
    keywords: /how (do i|to) (apply|claim|enrol|enroll|book|submit)|process|steps|application/i,
  },
  {
    id: HR_BUTTON_IDS.DOCUMENTS,
    title: 'Documents needed',
    hint: 'Supporting documents, invoices, or evidence',
    keywords: /document|paperwork|what (do i|to) (need|submit)|proof|invoice|gst/i,
  },
  {
    id: HR_BUTTON_IDS.LIMITS,
    title: 'Limits & coverage',
    hint: 'Amounts, caps, days, duration, and what is covered',
    keywords: /how (much|many)|limit|cap|entitlement|coverage|amount|days|weeks/i,
  },
  {
    id: HR_BUTTON_IDS.LEAVE,
    title: 'Leave types',
    hint: 'Earned, casual, sick, parental, special, and shared leave',
    keywords: /\bleave\b|earned leave|\bcl\b|\bel\b|casual leave|sick leave|wellbeing leave|bereavement|block leave|shared leave|parental/i,
  },
  {
    id: HR_BUTTON_IDS.MATERNITY,
    title: 'Maternity leave',
    hint: 'Maternity leave entitlement and conditions',
    keywords: /maternity|pregnancy|pregnant/i,
  },
  {
    id: HR_BUTTON_IDS.PATERNITY,
    title: 'Paternity leave',
    hint: 'Paternity leave entitlement and conditions',
    keywords: /paternity|new father|new dad/i,
  },
  {
    id: HR_BUTTON_IDS.HOLIDAYS,
    title: 'Public holidays',
    hint: 'Fixed and flexible public holidays',
    keywords: /public holiday|holiday calendar|flexible holiday/i,
  },
  {
    id: HR_BUTTON_IDS.STUDY_LEAVE,
    title: 'Study leave',
    hint: 'Extended unpaid leave for CA Final',
    keywords: /study leave|ca final|articleship|intern 4|\bcss\b/i,
  },
  {
    id: HR_BUTTON_IDS.FLEXI,
    title: 'Flexible work',
    hint: 'Flexi-time, part-time, WFH, telecommuting',
    keywords: /flexible work|flexi[\s-]?work|alternate work/i,
  },
  {
    id: HR_BUTTON_IDS.FLEXI_TIME,
    title: 'Flexi-time',
    hint: 'Flexible working hours arrangement',
    keywords: /flexi[\s-]?time|flexible hours|core hours/i,
  },
  {
    id: HR_BUTTON_IDS.PART_TIME,
    title: 'Part-time work',
    hint: 'Part-time working arrangement',
    keywords: /part[\s-]?time/i,
  },
  {
    id: HR_BUTTON_IDS.WFH,
    title: 'Work from home',
    hint: 'WFH and telecommuting for working mothers',
    keywords: /work from home|\bwfh\b|telecommut|remote work/i,
  },
  {
    id: HR_BUTTON_IDS.DAYCARE,
    title: 'Day care',
    hint: 'Childcare reimbursement and enrollment',
    keywords: /day[\s-]?care|childcare|child care|klay|medhaam|nursery|preschool/i,
  },
  {
    id: HR_BUTTON_IDS.HEALTH,
    title: 'Health checkup',
    hint: 'Annual health assessment booking',
    keywords: /health (check|assessment|screening)|annual checkup|tata 1mg|1mg|wellness/i,
  },
  {
    id: HR_BUTTON_IDS.MEDICAL,
    title: 'Medical support',
    hint: 'Financial support after mediclaim is exhausted',
    keywords: /medical exigenc|medical (loan|support|emergency|assistance)|mediclaim|hospital bill/i,
  },
  {
    id: HR_BUTTON_IDS.BENEVOLENCE,
    title: 'Benevolence help',
    hint: 'Hardship assistance via the Benevolence Committee',
    keywords: /benevolence|financial hardship|severe illness|accident-related|welfare grant/i,
  },
  {
    id: HR_BUTTON_IDS.COMPENSATION,
    title: 'Pay & bonus',
    hint: 'CTC, bonus, PF, NPS, reimbursements',
    keywords: /compensation|salary|\bctc\b|bonus|gratuity|\bnps\b|provident|\bpf\b|car lease/i,
  },
  {
    id: HR_BUTTON_IDS.IJP,
    title: 'Internal jobs',
    hint: 'DiversifEY internal job posting',
    keywords: /\bijp\b|internal job|diversifey|internal transfer|job posting|career mobility/i,
  },
  {
    id: HR_BUTTON_IDS.EOP,
    title: 'Equal opportunity',
    hint: 'Non-discrimination and reasonable accommodation',
    keywords: /equal opportunity|discriminat|disabilit|accommodation|accessibility|harassment/i,
  },
];

const HR_ACTION_BY_ID = new Map(HR_ACTION_CATALOG.map((a) => [a.id, a]));

const NAV_IDS = new Set<string>([HR_BUTTON_IDS.MAIN_MENU, HR_BUTTON_IDS.TYPE_QUESTION]);

/** Policy rows shown only when the employee has not yet asked a specific question. */
export const HR_POLICY_MENU: Array<{
  id: string;
  title: string;
  description: string;
}> = [
  { id: HR_BUTTON_IDS.LEAVE, title: 'Leave & holidays', description: 'EL, CL, sick, parental, PH' },
  { id: HR_BUTTON_IDS.COMPENSATION, title: 'Pay & bonus', description: 'CTC, bonus, PF, NPS' },
  { id: HR_BUTTON_IDS.FLEXI, title: 'Flexible work', description: 'Flexi-time, part-time, WFH' },
  { id: HR_BUTTON_IDS.DAYCARE, title: 'Day care', description: 'Childcare reimbursement' },
  { id: HR_BUTTON_IDS.HEALTH, title: 'Health checkup', description: 'Annual preventive checkup' },
  { id: HR_BUTTON_IDS.MEDICAL, title: 'Medical support', description: 'Help after mediclaim limit' },
  { id: HR_BUTTON_IDS.BENEVOLENCE, title: 'Benevolence', description: 'Hardship assistance' },
  { id: HR_BUTTON_IDS.IJP, title: 'Internal jobs', description: 'DiversifEY job postings' },
  { id: HR_BUTTON_IDS.EOP, title: 'Equal opportunity', description: 'Fair treatment & access' },
  { id: HR_BUTTON_IDS.STUDY_LEAVE, title: 'Study leave', description: 'CA Final unpaid leave' },
];

const RELATED_BY_POLICY: Record<string, string[]> = {
  [HR_BUTTON_IDS.LEAVE]: [
    HR_BUTTON_IDS.MATERNITY,
    HR_BUTTON_IDS.PATERNITY,
    HR_BUTTON_IDS.HOLIDAYS,
    HR_BUTTON_IDS.STUDY_LEAVE,
  ],
  [HR_BUTTON_IDS.MATERNITY]: [HR_BUTTON_IDS.LEAVE, HR_BUTTON_IDS.PATERNITY, HR_BUTTON_IDS.DAYCARE],
  [HR_BUTTON_IDS.PATERNITY]: [HR_BUTTON_IDS.LEAVE, HR_BUTTON_IDS.MATERNITY],
  [HR_BUTTON_IDS.HOLIDAYS]: [HR_BUTTON_IDS.LEAVE],
  [HR_BUTTON_IDS.STUDY_LEAVE]: [HR_BUTTON_IDS.LEAVE],
  [HR_BUTTON_IDS.FLEXI]: [
    HR_BUTTON_IDS.FLEXI_TIME,
    HR_BUTTON_IDS.PART_TIME,
    HR_BUTTON_IDS.WFH,
    HR_BUTTON_IDS.DAYCARE,
  ],
  [HR_BUTTON_IDS.FLEXI_TIME]: [HR_BUTTON_IDS.FLEXI, HR_BUTTON_IDS.PART_TIME, HR_BUTTON_IDS.WFH],
  [HR_BUTTON_IDS.PART_TIME]: [HR_BUTTON_IDS.FLEXI, HR_BUTTON_IDS.FLEXI_TIME],
  [HR_BUTTON_IDS.WFH]: [HR_BUTTON_IDS.FLEXI, HR_BUTTON_IDS.DAYCARE],
  [HR_BUTTON_IDS.DAYCARE]: [HR_BUTTON_IDS.WFH, HR_BUTTON_IDS.MATERNITY, HR_BUTTON_IDS.FLEXI],
  [HR_BUTTON_IDS.HEALTH]: [HR_BUTTON_IDS.MEDICAL],
  [HR_BUTTON_IDS.MEDICAL]: [HR_BUTTON_IDS.BENEVOLENCE, HR_BUTTON_IDS.HEALTH],
  [HR_BUTTON_IDS.BENEVOLENCE]: [HR_BUTTON_IDS.MEDICAL],
  [HR_BUTTON_IDS.COMPENSATION]: [],
  [HR_BUTTON_IDS.IJP]: [],
  [HR_BUTTON_IDS.EOP]: [],
};

const JOURNEY_IDS = [
  HR_BUTTON_IDS.ELIGIBILITY,
  HR_BUTTON_IDS.APPLY,
  HR_BUTTON_IDS.DOCUMENTS,
  HR_BUTTON_IDS.LIMITS,
] as const;

const JOURNEY_ALREADY_ASKED: Record<string, RegExp> = {
  [HR_BUTTON_IDS.ELIGIBILITY]: /eligib|who (can|is|are)|applicable|am i (allowed|covered|eligible)/i,
  [HR_BUTTON_IDS.APPLY]: /how (do i|to) (apply|claim|enrol|enroll|book|submit)|process|steps|application/i,
  [HR_BUTTON_IDS.DOCUMENTS]: /document|paperwork|what (do i|to) (need|submit)|proof|invoice/i,
  [HR_BUTTON_IDS.LIMITS]: /how (much|many)|limit|cap|entitlement|coverage|amount/i,
};

const JOURNEY_EVIDENCE: Record<string, RegExp> = {
  [HR_BUTTON_IDS.ELIGIBILITY]: /eligib|not eligible|applicable to|on-roll|on the rolls|who may apply/i,
  [HR_BUTTON_IDS.APPLY]:
    /apply|application process|booking process|enrol+|submit|submission|claim|approval process|how to book/i,
  [HR_BUTTON_IDS.DOCUMENTS]:
    /required documents|supporting documentation|documentation must|gst invoice|invoices|proof of/i,
  [HR_BUTTON_IDS.LIMITS]:
    /maximum|cannot exceed|up to two-thirds|entitlement|coverage limit|\binr\b|₹|percent|%\b/i,
};

const POLICY_EVIDENCE: Record<string, RegExp> = {
  [HR_BUTTON_IDS.LEAVE]:
    /earned leave|casual leave|leave policy|sick \/ wellbeing leave|wellbeing leave|shared leave|block leave/i,
  [HR_BUTTON_IDS.MATERNITY]: /maternity leave/i,
  [HR_BUTTON_IDS.PATERNITY]: /paternity leave/i,
  [HR_BUTTON_IDS.HOLIDAYS]: /public holidays|flexible holidays|fixed holidays/i,
  [HR_BUTTON_IDS.STUDY_LEAVE]: /extended study leave|ca final/i,
  [HR_BUTTON_IDS.FLEXI]: /flexible work arrangement|flexi-time arrangement|part-time working/i,
  [HR_BUTTON_IDS.FLEXI_TIME]: /flexi-time|flexi time|core hours/i,
  [HR_BUTTON_IDS.PART_TIME]: /part-time working|part time working/i,
  [HR_BUTTON_IDS.WFH]: /work from home|\bwfh\b|telecommut/i,
  [HR_BUTTON_IDS.DAYCARE]: /day care|daycare|klay|medhaam/i,
  [HR_BUTTON_IDS.HEALTH]: /health assessment|health checkup|tata 1mg|preventive health/i,
  [HR_BUTTON_IDS.MEDICAL]:
    /medical exigenc|mediclaim|hospitalization entitlement|inr 50,000|inr 3,00,000/i,
  [HR_BUTTON_IDS.BENEVOLENCE]: /benevolence/i,
  [HR_BUTTON_IDS.COMPENSATION]: /compensation policy|\bctc\b|annual bonus|gratuity|\bnps\b/i,
  [HR_BUTTON_IDS.IJP]: /internal job posting|\bijp\b|diversifey/i,
  [HR_BUTTON_IDS.EOP]: /equal opportunity|reasonable accommodation|non-discrimination/i,
};

const SYNTHETIC_HR_QUERY =
  /^(Eligibility rules for:|How to apply, claim|Documents and supporting|Limits, amounts|Leave policy entitlements:|Maternity leave entitlement|Paternity leave entitlement|Public holidays entitlement|Extended study leave|Flexible work arrangement options:|Flexi-time arrangement|Part-time working arrangement|Work from home and telecommuting|Day care policy|Health assessment policy:|Financial support for medical|Benevolence policy:|Compensation policy:|DiversifEY internal|Equal opportunity policy:)/i;

const MAIN_MENU_BUTTON = { id: HR_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' } as const;

export const HR_POLICY_BUTTON_IDS = new Set(HR_POLICY_MENU.map((p) => p.id));

const POLICY_QUERY_LABEL: Record<string, string> = {
  [HR_BUTTON_IDS.LEAVE]: 'Leave policy',
  [HR_BUTTON_IDS.MATERNITY]: 'Maternity leave',
  [HR_BUTTON_IDS.PATERNITY]: 'Paternity leave',
  [HR_BUTTON_IDS.HOLIDAYS]: 'Public holidays',
  [HR_BUTTON_IDS.STUDY_LEAVE]: 'Extended study leave',
  [HR_BUTTON_IDS.FLEXI]: 'Flexible work arrangement policy',
  [HR_BUTTON_IDS.FLEXI_TIME]: 'Flexi-time arrangement',
  [HR_BUTTON_IDS.PART_TIME]: 'Part-time working arrangement',
  [HR_BUTTON_IDS.WFH]: 'Work from home and telecommuting',
  [HR_BUTTON_IDS.DAYCARE]: 'Day care policy',
  [HR_BUTTON_IDS.HEALTH]: 'Health assessment policy',
  [HR_BUTTON_IDS.MEDICAL]: 'Financial support for medical exigencies',
  [HR_BUTTON_IDS.BENEVOLENCE]: 'Benevolence policy',
  [HR_BUTTON_IDS.COMPENSATION]: 'Compensation policy',
  [HR_BUTTON_IDS.IJP]: 'DiversifEY internal job posting policy',
  [HR_BUTTON_IDS.EOP]: 'Equal opportunity policy',
};

const SOURCE_BY_TOPIC: Record<string, string> = {
  [HR_BUTTON_IDS.LEAVE]: '09_leave_and_holidays.md',
  [HR_BUTTON_IDS.MATERNITY]: '09_leave_and_holidays.md',
  [HR_BUTTON_IDS.PATERNITY]: '09_leave_and_holidays.md',
  [HR_BUTTON_IDS.HOLIDAYS]: '09_leave_and_holidays.md',
  [HR_BUTTON_IDS.STUDY_LEAVE]: '10_extended_study_leave.md',
  [HR_BUTTON_IDS.FLEXI]: '06_flexible_work.md',
  [HR_BUTTON_IDS.FLEXI_TIME]: '06_flexible_work.md',
  [HR_BUTTON_IDS.PART_TIME]: '06_flexible_work.md',
  [HR_BUTTON_IDS.WFH]: '06_flexible_work.md',
  [HR_BUTTON_IDS.DAYCARE]: '03_day_care.md',
  [HR_BUTTON_IDS.HEALTH]: '07_health_assessment.md',
  [HR_BUTTON_IDS.MEDICAL]: '05_medical_exigencies.md',
  [HR_BUTTON_IDS.BENEVOLENCE]: '01_benevolence.md',
  [HR_BUTTON_IDS.COMPENSATION]: '02_compensation.md',
  [HR_BUTTON_IDS.IJP]: '08_internal_job_posting.md',
  [HR_BUTTON_IDS.EOP]: '04_equal_opportunity.md',
};

export function buildHrWelcomeResponse(): BotResponse {
  return {
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} *People Policies Assistant*\n\n` +
        'Ask in your own words — leave, pay, flexible work, day care, health checkups, medical support, internal jobs, and more.\n\n' +
        `Example: *How many earned leave days do I get?* or *Am I eligible for day care?*\n\n` +
        `${WA_EMOJI.next} Or pick a policy below. Type *menu* anytime to start over.`,
    ),
    buttonTitle: 'People policies',
    sections: [
      {
        title: 'Policies',
        rows: HR_POLICY_MENU.map((row) => ({
          id: row.id,
          title: row.title.slice(0, 24),
          description: row.description.slice(0, 72),
        })),
      },
    ],
  };
}

export function buildHrAskPromptResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Ask your people-policy question in your own words — for example *maternity leave days*, *IJP cooling period*, or *how to book a health checkup*.`,
    ),
  };
}

export function buildHrMenuNudgeResponse(): BotResponse {
  return buildHrWelcomeResponse();
}

export function formatHrAnswerText(input: string): string {
  let text = formatWhatsAppText(input);
  text = text.replace(/([^\n])\n(\*\s)/g, '$1\n\n$2');
  text = text.replace(/([.!?])[ \t]+(\*\s)/g, '$1\n\n$2');
  text = text.replace(/\n*(_?Choose a next step below\.?_?)\s*$/i, '\n\n$1');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export function formatHrActionsForPrompt(actionIds?: string[]): string {
  const actions =
    actionIds === undefined
      ? HR_ACTION_CATALOG
      : HR_ACTION_CATALOG.filter((a) => actionIds.includes(a.id));
  if (actions.length === 0) {
    return '(none — return buttons: [])';
  }
  return actions.map((a) => `- id: ${a.id} | title: "${a.title}" | when: ${a.hint}`).join('\n');
}

export function buildHrLlmExtraInstructions(
  excludeButtonId?: string,
  retrievedText?: string,
  question?: string,
): string {
  const contentIds = retrievedText
    ? collectHrButtonCandidates(question ?? '', retrievedText).filter((id) => id !== excludeButtonId)
    : undefined;
  const excludeNote = excludeButtonId
    ? `\nDo NOT include button id "${excludeButtonId}" — the employee already chose that step.\n`
    : '';
  return (
    `\nALLOWED_ACTIONS (pick 0–2 next-step ids ONLY if retrieved knowledge covers them; never invent ids or titles):\n` +
    `${formatHrActionsForPrompt(contentIds)}\n` +
    excludeNote +
    `\nRespond as JSON only:\n` +
    `{ "mode": "buttons", "text": string, "buttons": [{ "id": string, "title": string }] }\n\n` +
    `Structure the "text" field with blank lines between blocks:\n` +
    `1) One direct sentence answering the employee's question.\n` +
    `2) Blank line, then 2–4 bullets from retrieved knowledge only (each on its own line, starting with "* ").\n` +
    `3) Blank line, then: "Choose a next step below."\n` +
    `Do not suggest a step unless retrieved knowledge actually contains it. Do not guarantee approval for discretionary benefits.`
  );
}

const JOURNEY_ID_SET = new Set<string>(JOURNEY_IDS);

export function inferHrTopicFromActionId(actionId: string): string | undefined {
  const id = actionId.trim().toLowerCase();
  if (HR_POLICY_BUTTON_IDS.has(id) || POLICY_EVIDENCE[id]) return id;
  return undefined;
}

export function inferHrTopicFromChunks(chunks: Array<{ text?: string; source?: string }>): string | undefined {
  const corpus = chunks.map((c) => `${c.source ?? ''}\n${c.text ?? ''}`).join('\n');
  if (!corpus.trim()) return undefined;

  let best: { id: string; score: number } | undefined;
  for (const [id, evidence] of Object.entries(POLICY_EVIDENCE)) {
    if (!evidence.test(corpus)) continue;
    const sourceBoost = SOURCE_BY_TOPIC[id] && corpus.includes(SOURCE_BY_TOPIC[id]!) ? 2 : 0;
    const score = sourceBoost + 1;
    if (!best || score > best.score) best = { id, score };
  }
  return best?.id;
}

/** Employee wants an overview of available policies — not a single-policy lookup. */
export function isHrCatalogQuery(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (!q) return false;
  return (
    /\b(list|show|tell me about all|what are|which are|name all|enumerate)\b.{0,40}\b(polic(y|ies)|topics|benefits|programs|options)\b/i.test(
      q,
    ) ||
    /\b(polic(y|ies)|topics|benefits|programs)\b.{0,40}\b(list|all|available|have|cover|offer|there are)\b/i.test(
      q,
    ) ||
    /\bwhat (policies|benefits|topics) (are|do you|can you)\b/i.test(q) ||
    /\bwhat can you help (me )?with\b/i.test(q) ||
    /^policies$/i.test(q) ||
    /^all policies$/i.test(q)
  );
}

/** Short follow-up after a policy tap (e.g. "how do I apply?") — may reuse stored topic. */
export function isHrJourneyFollowUp(question: string): boolean {
  const q = question.trim();
  if (!q || isHrCatalogQuery(q)) return false;
  for (const id of JOURNEY_IDS) {
    if (JOURNEY_ALREADY_ASKED[id]?.test(q)) return true;
  }
  return /^(how do i|how to|what documents|am i eligible|can i apply|what is the process)\b/i.test(q);
}

export function resolveHrRetrievalTopic(
  question: string,
  opts: { hrTopicId?: string; excludeButtonId?: string },
  memoryTopicId?: string,
): string | undefined {
  if (opts.hrTopicId) return opts.hrTopicId;

  const fromButton = inferHrTopicFromActionId(opts.excludeButtonId ?? '');
  if (fromButton) return fromButton;

  if (isHrCatalogQuery(question)) return undefined;

  const matched = matchedHrPolicyIds(question);
  if (matched.length === 1) return matched[0];
  if (matched.length > 1) return undefined;

  if (memoryTopicId && isHrJourneyFollowUp(question)) return memoryTopicId;

  return undefined;
}

export function expandHrSearchQuery(question: string): string {
  if (isHrCatalogQuery(question)) {
    return (
      'People policies knowledge base employee policies list leave compensation flexible work ' +
      'day care health medical benevolence internal jobs equal opportunity study leave'
    );
  }
  return question;
}

export function buildHrCatalogResponse(): BotResponse {
  const welcome = buildHrWelcomeResponse();
  if (welcome.mode !== 'list') return welcome;
  return {
    ...welcome,
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} *People policies I can help with*\n\n` +
        'Pick a policy below, or ask something specific — e.g. *How many earned leave days do I get?* or *Am I eligible for day care?*\n\n' +
        'Type *menu* anytime to start over.',
    ),
  };
}

function keywordBoostScore(text: string, question: string): number {
  const corpus = text.toLowerCase();
  const words = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);
  let hits = 0;
  for (const word of words) {
    if (corpus.includes(word)) hits++;
  }
  return Math.min(0.15, hits * 0.025);
}

export function filterHrRetrievedChunks<T extends { text?: string; score: number; source?: string }>(
  chunks: T[],
  minScore: number,
  topicId?: string,
  question?: string,
): T[] {
  const withText = chunks.filter((c) => c.text);
  if (withText.length === 0) return [];

  const sourceHint = topicId ? SOURCE_BY_TOPIC[topicId] : undefined;
  const q = question?.trim() ?? '';

  const ranked = withText
    .map((chunk) => {
      let effective = chunk.score + (q ? keywordBoostScore(chunk.text!, q) : 0);
      if (sourceHint && chunk.source?.includes(sourceHint)) effective += 0.08;
      if (q && isHrCatalogQuery(q) && chunk.source?.includes('00_README')) effective += 0.12;
      return { chunk, effective };
    })
    .sort((a, b) => b.effective - a.effective);

  const above = ranked.filter((r) => r.effective >= minScore).map((r) => r.chunk);
  if (above.length > 0) return above.slice(0, 8);

  const relaxedMin = Math.max(0.12, minScore - 0.15);
  const relaxed = ranked.filter((r) => r.effective >= relaxedMin).map((r) => r.chunk);
  if (relaxed.length > 0) return relaxed.slice(0, 5);

  return ranked.slice(0, 3).map((r) => r.chunk);
}

export function actionsSupportedByKnowledge(retrievedText: string): Set<string> {
  const text = retrievedText.trim();
  const supported = new Set<string>();
  if (!text) return supported;

  for (const id of JOURNEY_IDS) {
    if (JOURNEY_EVIDENCE[id]?.test(text)) supported.add(id);
  }
  for (const [id, evidence] of Object.entries(POLICY_EVIDENCE)) {
    if (evidence.test(text)) supported.add(id);
  }
  return supported;
}

export function matchedHrPolicyIds(question: string): string[] {
  const q = question.trim();
  if (!q) return [];
  const matched: string[] = [];
  for (const action of HR_ACTION_CATALOG) {
    if (NAV_IDS.has(action.id) || JOURNEY_ID_SET.has(action.id)) continue;
    if (action.keywords?.test(q)) matched.push(action.id);
  }
  return matched;
}

function relatedActionsForPolicies(policies: string[]): string[] {
  const matched = new Set(policies);
  const skipParentExpansion =
    matched.has(HR_BUTTON_IDS.STUDY_LEAVE) ||
    matched.has(HR_BUTTON_IDS.MATERNITY) ||
    matched.has(HR_BUTTON_IDS.PATERNITY) ||
    matched.has(HR_BUTTON_IDS.HOLIDAYS) ||
    matched.has(HR_BUTTON_IDS.FLEXI_TIME) ||
    matched.has(HR_BUTTON_IDS.PART_TIME) ||
    matched.has(HR_BUTTON_IDS.WFH);

  const related: string[] = [];
  for (const pid of policies) {
    if (pid === HR_BUTTON_IDS.LEAVE && skipParentExpansion) continue;
    if (pid === HR_BUTTON_IDS.FLEXI && skipParentExpansion) continue;
    for (const rel of RELATED_BY_POLICY[pid] ?? []) {
      if (rel !== pid) related.push(rel);
    }
  }
  return related;
}

export function relevantHrActionIds(question: string): Set<string> {
  const allowed = new Set<string>();
  const policies = matchedHrPolicyIds(question);
  const q = question;

  if (policies.length > 0) {
    for (const id of JOURNEY_IDS) {
      const already = JOURNEY_ALREADY_ASKED[id];
      if (already?.test(q)) continue;
      allowed.add(id);
    }
    for (const pid of policies) allowed.add(pid);
    for (const rel of relatedActionsForPolicies(policies)) allowed.add(rel);
  }

  return allowed;
}

export function collectHrButtonCandidates(question: string, retrievedText?: string): string[] {
  if (retrievedText) {
    const supported = actionsSupportedByKnowledge(retrievedText);
    const current = new Set(matchedHrPolicyIds(question));
    const dominantPolicies = [...supported].filter((id) => Boolean(POLICY_EVIDENCE[id]));
    if (dominantPolicies.length === 1) current.add(dominantPolicies[0]!);
    const picks: string[] = [];
    for (const id of JOURNEY_IDS) {
      if (!supported.has(id) || current.has(id)) continue;
      if (JOURNEY_ALREADY_ASKED[id]?.test(question)) continue;
      picks.push(id);
    }
    for (const id of supported) {
      if (JOURNEY_ID_SET.has(id) || current.has(id) || NAV_IDS.has(id)) continue;
      picks.push(id);
    }
    return [...new Set(picks)];
  }

  const allowed = relevantHrActionIds(question);
  const policies = matchedHrPolicyIds(question);
  const picks: string[] = [];

  for (const id of JOURNEY_IDS) {
    if (allowed.has(id)) picks.push(id);
  }
  for (const rel of relatedActionsForPolicies(policies)) picks.push(rel);
  for (const pid of policies) {
    if (!picks.includes(pid)) picks.push(pid);
  }

  return [...new Set(picks)];
}

export function buildHrButtonRow(
  candidateIds: string[],
  question: string,
  excludeIds: string[] = [],
  retrievedText?: string,
): Array<{ id: string; title: string }> {
  const exclude = new Set([
    ...excludeIds.filter(Boolean),
    ...matchedHrPolicyIds(question),
  ]);
  if (retrievedText) {
    const dominant = [...actionsSupportedByKnowledge(retrievedText)].filter((id) =>
      Boolean(POLICY_EVIDENCE[id]),
    );
    if (dominant.length === 1) exclude.add(dominant[0]!);
  }
  const used = new Set<string>();
  const row: Array<{ id: string; title: string }> = [];
  const allowed = retrievedText
    ? actionsSupportedByKnowledge(retrievedText)
    : relevantHrActionIds(question);

  const tryAdd = (id: string): boolean => {
    if (exclude.has(id) || used.has(id) || NAV_IDS.has(id)) return false;
    const action = HR_ACTION_BY_ID.get(id);
    if (!action) return false;
    if (allowed.size > 0 && !allowed.has(id)) return false;
    if (retrievedText && allowed.size === 0) return false;
    row.push({ id: action.id, title: action.title.slice(0, 20) });
    used.add(id);
    return true;
  };

  for (const id of candidateIds) {
    if (row.length >= 2) break;
    tryAdd(id);
  }
  if (row.length < 2 && !retrievedText) {
    for (const id of collectHrButtonCandidates(question)) {
      if (row.length >= 2) break;
      tryAdd(id);
    }
  }
  if (row.length < 2 && retrievedText) {
    for (const id of allowed) {
      if (row.length >= 2) break;
      tryAdd(id);
    }
  }

  row.push({ id: MAIN_MENU_BUTTON.id, title: MAIN_MENU_BUTTON.title });
  return row.slice(0, 3);
}

export function enforceHrBotResponse(
  response: BotResponse,
  question: string,
  excludeButtonId?: string,
  retrievedText?: string,
): BotResponse {
  const excludeIds = excludeButtonId ? [excludeButtonId] : [];
  const raw =
    response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
      ? response.text
      : '';
  const text = formatHrAnswerText(raw);

  if (!text) {
    return buildHrNearMissResponse(question, excludeButtonId);
  }

  let llmCandidates: string[] = [];
  if (response.mode === 'buttons' && response.buttons?.length) {
    llmCandidates = response.buttons
      .map((b) => HR_ACTION_BY_ID.get(b.id.trim())?.id)
      .filter((id): id is string => Boolean(id));
  }

  const buttons = buildHrButtonRow(
    [...llmCandidates, ...collectHrButtonCandidates(question, retrievedText)],
    question,
    excludeIds,
    retrievedText,
  );

  return { mode: 'buttons', text, buttons };
}

export function hrActionQuery(actionId: string, topicId?: string): string | undefined {
  const id = actionId.trim().toLowerCase();
  const topic = topicId?.trim().toLowerCase();
  const topicLabel = topic ? POLICY_QUERY_LABEL[topic] : undefined;

  if (JOURNEY_ID_SET.has(id) && topic && topicLabel) {
    switch (id) {
      case HR_BUTTON_IDS.ELIGIBILITY:
        return `${topicLabel}: who is eligible and who is not eligible?`;
      case HR_BUTTON_IDS.APPLY:
        return `${topicLabel}: how to apply, claim, enrol, book, or submit requests and approval steps`;
      case HR_BUTTON_IDS.DOCUMENTS:
        return `${topicLabel}: required documents and supporting evidence`;
      case HR_BUTTON_IDS.LIMITS:
        return `${topicLabel}: limits, amounts, entitlements, coverage caps, and maximum assistance`;
    }
  }

  switch (id) {
    case HR_BUTTON_IDS.ELIGIBILITY:
      return topicLabel
        ? `${topicLabel}: who is eligible and who is not eligible?`
        : 'People policy eligibility overview';
    case HR_BUTTON_IDS.APPLY:
      return topicLabel
        ? `${topicLabel}: how to apply, claim, enrol, or submit requests`
        : 'How to apply for people policies';
    case HR_BUTTON_IDS.DOCUMENTS:
      return topicLabel
        ? `${topicLabel}: required documents and supporting evidence`
        : 'Documents required for people policy requests';
    case HR_BUTTON_IDS.LIMITS:
      return topicLabel
        ? `${topicLabel}: limits, amounts, entitlements, and coverage`
        : 'People policy limits and entitlements';
    case HR_BUTTON_IDS.LEAVE:
      return 'Leave policy entitlements: earned leave, casual leave, sick leave, parental leave, special leave, shared leave';
    case HR_BUTTON_IDS.MATERNITY:
      return 'Maternity leave entitlement, eligibility, and conditions';
    case HR_BUTTON_IDS.PATERNITY:
      return 'Paternity leave entitlement, eligibility, and conditions';
    case HR_BUTTON_IDS.HOLIDAYS:
      return 'Public holidays entitlement, fixed holidays, and flexible holidays';
    case HR_BUTTON_IDS.STUDY_LEAVE:
      return 'Extended study leave for CA Final: eligibility, duration, unpaid leave, approval process';
    case HR_BUTTON_IDS.FLEXI:
      return 'Flexible work arrangement options: flexi-time, part-time, telecommuting, work from home';
    case HR_BUTTON_IDS.FLEXI_TIME:
      return 'Flexi-time arrangement eligibility, core hours, and approval process';
    case HR_BUTTON_IDS.PART_TIME:
      return 'Part-time working arrangement eligibility, hours, and process';
    case HR_BUTTON_IDS.WFH:
      return 'Work from home and telecommuting for working mothers: eligibility and process';
    case HR_BUTTON_IDS.DAYCARE:
      return 'Day care policy eligibility, reimbursement, enrollment, documents, GST';
    case HR_BUTTON_IDS.HEALTH:
      return 'Health assessment policy: eligibility, coverage, Tata 1MG booking process';
    case HR_BUTTON_IDS.MEDICAL:
      return 'Financial support for medical exigencies: eligibility, amount range, process after mediclaim exhaustion';
    case HR_BUTTON_IDS.BENEVOLENCE:
      return 'Benevolence policy: eligibility, committee, application process, assistance limits';
    case HR_BUTTON_IDS.COMPENSATION:
      return 'Compensation policy: CTC, bonus eligibility, PF, NPS, reimbursements, gratuity';
    case HR_BUTTON_IDS.IJP:
      return 'DiversifEY internal job posting IJP: eligibility, application limits, cooling period, process';
    case HR_BUTTON_IDS.EOP:
      return 'Equal opportunity policy: non-discrimination, reasonable accommodation, accessibility';
    default:
      return undefined;
  }
}

export function lastHrUserQuestion(turns: Array<{ role: string; content: string }>): string {
  let fallback = '';
  for (let i = turns.length - 1; i >= 0; i--) {
    const content = turns[i]?.content.trim();
    if (turns[i]?.role !== 'user' || !content) continue;
    if (!fallback) fallback = content;
    if (content.startsWith('hr_')) continue;
    if (SYNTHETIC_HR_QUERY.test(content)) continue;
    return content;
  }
  return fallback;
}

export function buildHrNearMissAllowList(): NearMissAllowList {
  return {
    topics: HR_POLICY_MENU.map((p) => ({
      label: p.title,
      detail: p.description,
    })),
    owners: [],
  };
}

export function buildHrNearMissReply(_question: string): string {
  const topics = HR_POLICY_MENU.map((p) => `* ${p.title}`).join('\n');
  return (
    `I don't have that detail in the people policies yet.\n\n` +
    `I can help with:\n${topics}\n\n` +
    `Ask in your own words, or pick a policy below.`
  );
}

export function buildHrNearMissResponse(question: string, excludeButtonId?: string): BotResponse {
  const topicId = inferHrTopicFromActionId(excludeButtonId ?? '') ?? matchedHrPolicyIds(question)[0];
  const topicTitle = topicId ? HR_ACTION_BY_ID.get(topicId)?.title : undefined;
  const detail = topicTitle
    ? `I couldn't find enough detail on *${topicTitle}* in the people policies right now.`
    : `I couldn't find enough detail in the people policies right now.`;

  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} ${detail}\n\n` +
        'Try asking in your own words, or return to the main menu to pick another policy.',
    ),
    buttons: [{ id: MAIN_MENU_BUTTON.id, title: MAIN_MENU_BUTTON.title }],
  };
}

export function looksLikeHrMenuChoice(text: string): boolean {
  const key = text.trim().toLowerCase();
  if (!key) return false;
  return key.startsWith('hr_');
}

export function resolveHrMenuSelection(input: string): string {
  const key = input.trim().toLowerCase();
  if (key === HR_BUTTON_IDS.MAIN_MENU || key === 'main menu' || key === 'menu') {
    return HR_BUTTON_IDS.MAIN_MENU;
  }
  if (key === HR_BUTTON_IDS.TYPE_QUESTION || key === 'ask anything' || key === 'ask again') {
    return HR_BUTTON_IDS.TYPE_QUESTION;
  }
  const aliases: Record<string, string> = {
    'leave & holidays': HR_BUTTON_IDS.LEAVE,
    'leave types': HR_BUTTON_IDS.LEAVE,
    'pay & bonus': HR_BUTTON_IDS.COMPENSATION,
    'flexible work': HR_BUTTON_IDS.FLEXI,
    'day care': HR_BUTTON_IDS.DAYCARE,
    daycare: HR_BUTTON_IDS.DAYCARE,
    'health checkup': HR_BUTTON_IDS.HEALTH,
    'medical support': HR_BUTTON_IDS.MEDICAL,
    benevolence: HR_BUTTON_IDS.BENEVOLENCE,
    'internal jobs': HR_BUTTON_IDS.IJP,
    ijp: HR_BUTTON_IDS.IJP,
    'equal opportunity': HR_BUTTON_IDS.EOP,
    'study leave': HR_BUTTON_IDS.STUDY_LEAVE,
    'am i eligible?': HR_BUTTON_IDS.ELIGIBILITY,
    'how to apply': HR_BUTTON_IDS.APPLY,
    'documents needed': HR_BUTTON_IDS.DOCUMENTS,
    'limits & coverage': HR_BUTTON_IDS.LIMITS,
    'maternity leave': HR_BUTTON_IDS.MATERNITY,
    'paternity leave': HR_BUTTON_IDS.PATERNITY,
    'public holidays': HR_BUTTON_IDS.HOLIDAYS,
    'work from home': HR_BUTTON_IDS.WFH,
    'part-time work': HR_BUTTON_IDS.PART_TIME,
    'flexi-time': HR_BUTTON_IDS.FLEXI_TIME,
  };
  if (HR_ACTION_BY_ID.has(key)) return key;
  return aliases[key] ?? key;
}
