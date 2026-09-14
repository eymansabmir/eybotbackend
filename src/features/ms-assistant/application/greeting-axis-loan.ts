import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText, WA_EMOJI } from '../infrastructure/formatter/whatsapp-format';
import type { NearMissAllowList } from '../infrastructure/llm/shared';
import { buildBurgundyWelcome, buildBurgundyWelcomeSequence } from './axis-burgundy';

export const AXIS_BUTTON_IDS = {
  MAIN_MENU: 'axis_main_menu',
  TYPE_QUESTION: 'axis_ask',
  LOAN_PERSONAL: 'axis_loan_personal',
  LOAN_HOME: 'axis_loan_home',
  LOAN_CAR: 'axis_loan_car',
  LOAN_OTHER: 'axis_loan_other',
  IMPROVE_OFFER: 'axis_improve_offer',
  CHANGE_LOAN: 'axis_change_loan',
  SPEAK_EXPERT: 'axis_speak_expert',
  REQUEST_BEST: 'axis_request_best',
  PROCEED_OFFER: 'axis_proceed_offer',
  SPEAK_RM: 'axis_speak_rm',
  SUBMIT_REVIEW: 'axis_submit_review',
  REQUEST_EXCEPTION: 'axis_request_exception',
  REVIEW_LOAN: 'axis_review_loan',
  VIEW_EMI: 'axis_view_emi',
  VIEW_REVISED_EMI: 'axis_view_revised_emi',
  NEED_BETTER_RATE: 'axis_need_better_rate',
  VIEW_OFFER_DETAILS: 'axis_view_offer_details',
  GET_LOAN: 'axis_get_loan',
  APPLY_LOAN: 'axis_apply_loan',
  BETTER_RATE: 'axis_better_rate',
  EMI_CALC: 'axis_emi_calc',
  RATES_FEES: 'axis_rates_fees',
  ELIGIBILITY: 'axis_eligibility',
  DOCUMENTS: 'axis_documents',
  APPLICATION: 'axis_application',
  AFFORDABILITY: 'axis_affordability',
  COMPARE_TENURE: 'axis_compare_tenure',
  OBJECTIONS: 'axis_objections',
  CALLBACK: 'axis_callback',
  PURPOSE_HOME: 'axis_purpose_home',
  PURPOSE_MEDICAL: 'axis_purpose_medical',
  PURPOSE_WEDDING: 'axis_purpose_wedding',
  PRIORITY_EMI: 'axis_priority_emi',
  PRIORITY_RATE: 'axis_priority_rate',
  PRIORITY_FEE: 'axis_priority_fee',
} as const;

export type AxisAction = {
  id: string;
  title: string;
  hint: string;
};

export const AXIS_ACTION_CATALOG: AxisAction[] = [
  { id: AXIS_BUTTON_IDS.EMI_CALC, title: 'EMI examples', hint: 'EMI calculations and tenure comparisons' },
  { id: AXIS_BUTTON_IDS.RATES_FEES, title: 'Rates & fees', hint: 'Interest rate and processing fee' },
  { id: AXIS_BUTTON_IDS.ELIGIBILITY, title: 'Eligibility', hint: 'Who qualifies and basic criteria' },
  { id: AXIS_BUTTON_IDS.DOCUMENTS, title: 'Documents', hint: 'KYC and income documents' },
  { id: AXIS_BUTTON_IDS.APPLICATION, title: 'How to apply', hint: 'Application journey steps' },
  { id: AXIS_BUTTON_IDS.AFFORDABILITY, title: 'Affordability', hint: 'EMI comfort and repayment capacity' },
  { id: AXIS_BUTTON_IDS.COMPARE_TENURE, title: 'Compare tenure', hint: '36 vs 48 vs 60 month EMI' },
  { id: AXIS_BUTTON_IDS.OBJECTIONS, title: 'Common concerns', hint: 'Rate, fee, and competitor objections' },
  { id: AXIS_BUTTON_IDS.BETTER_RATE, title: 'Better rate', hint: 'Demo negotiation — synthetic concession' },
  { id: AXIS_BUTTON_IDS.APPLY_LOAN, title: 'Apply now', hint: 'Start lead capture' },
  { id: AXIS_BUTTON_IDS.CALLBACK, title: 'Get callback', hint: 'Request advisor callback (demo)' },
];

const AXIS_ACTION_BY_ID = new Map(AXIS_ACTION_CATALOG.map((a) => [a.id, a]));

const AXIS_LEAD_BUTTON_IDS = new Set<string>([
  AXIS_BUTTON_IDS.APPLY_LOAN,
  AXIS_BUTTON_IDS.PROCEED_OFFER,
  AXIS_BUTTON_IDS.CALLBACK,
]);

const AXIS_BUTTON_FALLBACKS = [
  AXIS_BUTTON_IDS.EMI_CALC,
  AXIS_BUTTON_IDS.RATES_FEES,
  AXIS_BUTTON_IDS.ELIGIBILITY,
  AXIS_BUTTON_IDS.DOCUMENTS,
] as const;

export function buildAxisWelcomeResponse(): BotResponse {
  return buildBurgundyWelcome();
}

export function buildAxisGreetingButtonsResponse(customerName?: string): BotResponse {
  return buildBurgundyWelcome(customerName);
}

export function buildAxisWelcomeSequence(
  customerName?: string,
  welcomeImageUrl?: string,
): BotResponse[] {
  return buildBurgundyWelcomeSequence(customerName, welcomeImageUrl);
}

export function buildAxisAskPromptResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `${WA_EMOJI.tip} Ask — e.g. *EMI for ₹5 lakh*, *documents needed*, *rate too high*, or *prepayment rules*.`,
    ),
  };
}

export function buildAxisMenuNudgeResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(`${WA_EMOJI.tip} Type your question or tap below.`),
    buttons: [
      { id: AXIS_BUTTON_IDS.EMI_CALC, title: 'EMI examples' },
      { id: AXIS_BUTTON_IDS.APPLY_LOAN, title: 'Apply now' },
      { id: AXIS_BUTTON_IDS.MAIN_MENU, title: 'Main menu' },
    ],
  };
}

export function formatAxisActionsForPrompt(): string {
  return AXIS_ACTION_CATALOG.map((a) => `- id: ${a.id} | title: "${a.title}" | when: ${a.hint}`).join('\n');
}

export function buildAxisLlmExtraInstructions(
  excludeButtonId?: string,
  discoveryContext?: string,
): string {
  const excludeNote = excludeButtonId
    ? `\nDo NOT include button id "${excludeButtonId}".\n`
    : '';
  return (
    `\nWHATSAPP AGENTIC AI STYLE (mandatory):\n` +
    `- You are an AI assistant that pre-scans salary + relationship profile.\n` +
    `- Show ✅ eligible / ❌ human-RM-only lines; keep messages very short.\n` +
    `- One AI rate concession max; then hand off to human RM via Submit for Review.\n` +
    `- Demo rates enforced server-side — do not invent.\n` +
    `- Never guarantee approval. Do NOT ask for lead fields — Start Application handles capture.\n` +
    (discoveryContext ?? '') +
    `\nALLOWED_ACTIONS (pick 2 for slots 1–2; slot 3 ALWAYS Apply now):\n` +
    `${formatAxisActionsForPrompt()}\n` +
    excludeNote +
    `\nJSON: { "mode": "buttons", "text": string, "buttons": [{ "id": string, "title": string }] }\n` +
    `Answer from retrieved knowledge only.`
  );
}

export function buildAxisButtonRow(
  candidateIds: string[],
  excludeIds: string[] = [],
): Array<{ id: string; title: string }> {
  const exclude = new Set(excludeIds.filter(Boolean));
  const used = new Set<string>();
  const row: Array<{ id: string; title: string }> = [];

  const tryAdd = (id: string): boolean => {
    if (exclude.has(id) || used.has(id) || AXIS_LEAD_BUTTON_IDS.has(id)) return false;
    const action = AXIS_ACTION_BY_ID.get(id);
    if (!action) return false;
    row.push({ id: action.id, title: action.title.slice(0, 20) });
    used.add(id);
    return true;
  };

  for (const id of candidateIds) {
    if (row.length >= 2) break;
    tryAdd(id);
  }
  for (const id of AXIS_BUTTON_FALLBACKS) {
    if (row.length >= 2) break;
    tryAdd(id);
  }

  const thirdId = exclude.has(AXIS_BUTTON_IDS.APPLY_LOAN)
    ? AXIS_BUTTON_IDS.BETTER_RATE
    : AXIS_BUTTON_IDS.APPLY_LOAN;
  const third = AXIS_ACTION_BY_ID.get(thirdId);
  if (third) row.push({ id: third.id, title: third.title.slice(0, 20) });

  return row.slice(0, 3);
}

export function enforceAxisBotResponse(
  response: BotResponse,
  question: string,
  excludeButtonId?: string,
): BotResponse {
  const excludeIds = excludeButtonId ? [excludeButtonId] : [];
  const text =
    response.mode === 'text' || response.mode === 'buttons' || response.mode === 'list'
      ? formatWhatsAppText(response.text)
      : '';

  if (!text) return buildAxisNearMissResponse(question, excludeButtonId);

  const topicCandidates = collectAxisButtonCandidates(question);
  let llmCandidates: string[] = [];
  if (response.mode === 'buttons' && response.buttons?.length) {
    llmCandidates = response.buttons
      .map((b) => AXIS_ACTION_BY_ID.get(b.id.trim())?.id)
      .filter((id): id is string => Boolean(id));
  }

  return {
    mode: 'buttons',
    text,
    buttons: buildAxisButtonRow([...llmCandidates, ...topicCandidates], excludeIds),
  };
}

function collectAxisButtonCandidates(question: string): string[] {
  const q = question.toLowerCase();
  if (/emi|monthly|afford|installment/.test(q)) {
    return [AXIS_BUTTON_IDS.EMI_CALC, AXIS_BUTTON_IDS.COMPARE_TENURE, AXIS_BUTTON_IDS.AFFORDABILITY];
  }
  if (/rate|interest|expensive|fee|processing/.test(q)) {
    return [AXIS_BUTTON_IDS.RATES_FEES, AXIS_BUTTON_IDS.BETTER_RATE, AXIS_BUTTON_IDS.OBJECTIONS];
  }
  if (/eligible|qualify|salary|cibil/.test(q)) {
    return [AXIS_BUTTON_IDS.ELIGIBILITY, AXIS_BUTTON_IDS.DOCUMENTS, AXIS_BUTTON_IDS.AFFORDABILITY];
  }
  if (/document|kyc|proof/.test(q)) {
    return [AXIS_BUTTON_IDS.DOCUMENTS, AXIS_BUTTON_IDS.APPLICATION, AXIS_BUTTON_IDS.ELIGIBILITY];
  }
  if (/apply|application|disburse/.test(q)) {
    return [AXIS_BUTTON_IDS.APPLICATION, AXIS_BUTTON_IDS.DOCUMENTS, AXIS_BUTTON_IDS.ELIGIBILITY];
  }
  if (/discount|negotiat|concession|better|lower|cheaper/.test(q)) {
    return [AXIS_BUTTON_IDS.BETTER_RATE, AXIS_BUTTON_IDS.RATES_FEES, AXIS_BUTTON_IDS.OBJECTIONS];
  }
  return [AXIS_BUTTON_IDS.EMI_CALC, AXIS_BUTTON_IDS.RATES_FEES, AXIS_BUTTON_IDS.ELIGIBILITY];
}

export function buildAxisNearMissResponse(question: string, excludeButtonId?: string): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(buildAxisNearMissReply(question)),
    buttons: buildAxisButtonRow(collectAxisButtonCandidates(question), excludeButtonId ? [excludeButtonId] : []),
  };
}

export function buildAxisNearMissAllowList(): NearMissAllowList {
  return {
    topics: [
      { label: 'Rates & fees', detail: 'Interest and processing charges' },
      { label: 'EMI examples', detail: 'Monthly payment illustrations' },
      { label: 'Eligibility', detail: 'Qualification criteria' },
      { label: 'Documents', detail: 'KYC and income documents' },
      { label: 'Apply now', detail: 'Demo application capture' },
    ],
    owners: [],
  };
}

export function buildAxisNearMissReply(_question: string): string {
  return (
    `I don't have exact details for that yet.\n\n` +
    `Try EMI, rates & fees, eligibility, documents, or how to apply.\n\n` +
    `Or tap *Apply now*.`
  );
}

export function lastAxisUserQuestion(turns: Array<{ role: string; content: string }>): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === 'user' && turns[i]?.content.trim()) return turns[i]!.content.trim();
  }
  return '';
}

export function isAxisLeadButton(id: string): boolean {
  return AXIS_LEAD_BUTTON_IDS.has(id.trim().toLowerCase());
}

export function isAxisNegotiationButton(id: string): boolean {
  const key = id.trim().toLowerCase();
  return (
    key === AXIS_BUTTON_IDS.BETTER_RATE ||
    key === AXIS_BUTTON_IDS.NEED_BETTER_RATE ||
    key === AXIS_BUTTON_IDS.IMPROVE_OFFER ||
    key === AXIS_BUTTON_IDS.REQUEST_BEST
  );
}

export function isAxisLoanTypeButton(id: string): boolean {
  const key = id.trim().toLowerCase();
  return (
    key === AXIS_BUTTON_IDS.LOAN_PERSONAL ||
    key === AXIS_BUTTON_IDS.LOAN_HOME ||
    key === AXIS_BUTTON_IDS.LOAN_CAR ||
    key === AXIS_BUTTON_IDS.LOAN_OTHER
  );
}

export function isAxisGetLoanButton(id: string): boolean {
  return id.trim().toLowerCase() === AXIS_BUTTON_IDS.GET_LOAN;
}

export function isAxisPurposeButton(id: string): boolean {
  const key = id.trim().toLowerCase();
  return (
    key === AXIS_BUTTON_IDS.PURPOSE_HOME ||
    key === AXIS_BUTTON_IDS.PURPOSE_MEDICAL ||
    key === AXIS_BUTTON_IDS.PURPOSE_WEDDING
  );
}

export function isAxisPriorityButton(id: string): boolean {
  const key = id.trim().toLowerCase();
  return (
    key === AXIS_BUTTON_IDS.PRIORITY_EMI ||
    key === AXIS_BUTTON_IDS.PRIORITY_RATE ||
    key === AXIS_BUTTON_IDS.PRIORITY_FEE
  );
}

export function isAxisCompareTenureButton(id: string): boolean {
  return id.trim().toLowerCase() === AXIS_BUTTON_IDS.COMPARE_TENURE;
}

export function axisLeadIntentFromButton(id: string): 'apply' | 'callback' {
  return id.trim().toLowerCase() === AXIS_BUTTON_IDS.CALLBACK ? 'callback' : 'apply';
}

export function axisActionQuery(actionId: string, contextQuestion: string): string | undefined {
  const ctx = contextQuestion.trim() || 'Axis Bank personal loan';
  const key = actionId.trim().toLowerCase();
  switch (key) {
    case AXIS_BUTTON_IDS.EMI_CALC:
      return `Personal loan EMI examples monthly payment ${ctx}`;
    case AXIS_BUTTON_IDS.RATES_FEES:
      return 'Personal loan interest rate processing fee charges GST';
    case AXIS_BUTTON_IDS.ELIGIBILITY:
      return 'Personal loan eligibility criteria income employment';
    case AXIS_BUTTON_IDS.DOCUMENTS:
      return 'Documents required personal loan KYC income proof';
    case AXIS_BUTTON_IDS.APPLICATION:
      return 'Personal loan application journey steps';
    case AXIS_BUTTON_IDS.AFFORDABILITY:
      return 'Personal loan affordability EMI comfort repayment capacity';
    case AXIS_BUTTON_IDS.COMPARE_TENURE:
      return 'Compare personal loan tenure 36 48 60 months EMI';
    case AXIS_BUTTON_IDS.OBJECTIONS:
      return 'Personal loan objection handling rate fee competitor';
    case AXIS_BUTTON_IDS.BETTER_RATE:
      return 'Synthetic demo negotiation discount personal loan';
    default:
      return undefined;
  }
}

const AXIS_MENU_ALIASES: Record<string, string> = {
  'personal loan': AXIS_BUTTON_IDS.LOAN_PERSONAL,
  'explore personal loan': AXIS_BUTTON_IDS.LOAN_PERSONAL,
  'explore home loan': AXIS_BUTTON_IDS.LOAN_HOME,
  'explore car loan': AXIS_BUTTON_IDS.LOAN_CAR,
  'home loan': AXIS_BUTTON_IDS.LOAN_HOME,
  'car loan': AXIS_BUTTON_IDS.LOAN_CAR,
  'improve my offer': AXIS_BUTTON_IDS.IMPROVE_OFFER,
  'change loan details': AXIS_BUTTON_IDS.CHANGE_LOAN,
  'speak to an expert': AXIS_BUTTON_IDS.SPEAK_EXPERT,
  'request best offer': AXIS_BUTTON_IDS.REQUEST_BEST,
  'proceed with this offer': AXIS_BUTTON_IDS.PROCEED_OFFER,
  'proceed with offer': AXIS_BUTTON_IDS.PROCEED_OFFER,
  'speak to my relationship manager': AXIS_BUTTON_IDS.SPEAK_RM,
  'speak to rm': AXIS_BUTTON_IDS.SPEAK_RM,
  'request exception': AXIS_BUTTON_IDS.REQUEST_EXCEPTION,
  'submit for review': AXIS_BUTTON_IDS.SUBMIT_REVIEW,
  'review loan details': AXIS_BUTTON_IDS.REVIEW_LOAN,
  'start application': AXIS_BUTTON_IDS.APPLY_LOAN,
  'start loan application': AXIS_BUTTON_IDS.APPLY_LOAN,
  'view emi': AXIS_BUTTON_IDS.VIEW_EMI,
  'view offer details': AXIS_BUTTON_IDS.VIEW_OFFER_DETAILS,
  'need better rate': AXIS_BUTTON_IDS.NEED_BETTER_RATE,
  'apply now': AXIS_BUTTON_IDS.APPLY_LOAN,
  'better rate': AXIS_BUTTON_IDS.BETTER_RATE,
  'negotiate more': AXIS_BUTTON_IDS.BETTER_RATE,
  'calculate emi': AXIS_BUTTON_IDS.EMI_CALC,
  'emi examples': AXIS_BUTTON_IDS.EMI_CALC,
  'rates & fees': AXIS_BUTTON_IDS.RATES_FEES,
  eligibility: AXIS_BUTTON_IDS.ELIGIBILITY,
  'check eligibility': AXIS_BUTTON_IDS.ELIGIBILITY,
  documents: AXIS_BUTTON_IDS.DOCUMENTS,
  'how to apply': AXIS_BUTTON_IDS.APPLICATION,
  affordability: AXIS_BUTTON_IDS.AFFORDABILITY,
  'compare tenure': AXIS_BUTTON_IDS.COMPARE_TENURE,
  'get callback': AXIS_BUTTON_IDS.CALLBACK,
  'ask anything': AXIS_BUTTON_IDS.TYPE_QUESTION,
  'lower emi': AXIS_BUTTON_IDS.PRIORITY_EMI,
  'lower rate': AXIS_BUTTON_IDS.PRIORITY_RATE,
  'processing fee': AXIS_BUTTON_IDS.PRIORITY_FEE,
};

export function resolveAxisMenuSelection(input: string): string {
  const key = input.trim().toLowerCase();
  if (key === AXIS_BUTTON_IDS.TYPE_QUESTION || key === 'axis_ask') return AXIS_BUTTON_IDS.TYPE_QUESTION;
  if (key === AXIS_BUTTON_IDS.MAIN_MENU || key === 'main menu' || key === 'menu') return AXIS_BUTTON_IDS.MAIN_MENU;
  return AXIS_MENU_ALIASES[key] ?? input;
}

export function looksLikeAxisMenuChoice(text: string): boolean {
  const key = text.trim().toLowerCase();
  if (!key) return false;
  if (key.startsWith('axis_')) return true;
  return key in AXIS_MENU_ALIASES;
}
