import type { BotResponse } from '../domain/bot-response';
import { formatWhatsAppText, WA_EMOJI } from '../infrastructure/formatter/whatsapp-format';
import { AXIS_BUTTON_IDS } from './greeting-axis-loan';
import { estimateEmi, formatInr } from './axis-negotiation';
import { parseLoanAmount, parseTenureMonths } from './axis-lead';

export type BurgundyLoanType = 'personal' | 'home' | 'car' | 'other';

export type BurgundyStage =
  | 'initial'
  | 'concession_1'
  | 'best_direct'
  | 'exception_offered'
  | 'exception_requested'
  | 'ready_to_apply'
  | 'review_prompt'
  | 'escalation_pending'
  | 'final';

export type BurgundyDiscoveryState = {
  step: 'idle' | 'loan_type' | 'requirement' | 'offer_shown' | 'done';
  customerType: 'burgundy';
  loanType?: BurgundyLoanType;
  loanAmount?: number;
  loanPurpose?: string;
  tenureMonths?: number;
  notInterested?: boolean;
  thinkingAboutIt?: boolean;
};

export type BurgundyNegotiationState = {
  stage: BurgundyStage;
  loanType?: BurgundyLoanType;
  loanAmount?: number;
  loanPurpose?: string;
  tenureMonths?: number;
  currentRatePct: number;
  initialRatePct: number;
  awaitingConcessionReveal?: boolean;
  relationshipConcessionGiven?: boolean;
  escalationTriggered?: boolean;
  escalationAt?: number;
  finalOfferDelivered?: boolean;
  customerName?: string;
  reviewReferenceId?: string;
  reviewSubmitted?: boolean;
  eligibleMaxAmount?: number;
};

/** Demo profile pulled from Axis relationship + salary signals. */
export const DEMO_PL_ELIGIBLE_MAX = 1_800_000;
export const DEMO_HOME_ELIGIBLE_MAX = 6_000_000;
export const DEMO_RELATIONSHIP_YEARS = 8;
export const DEMO_MONTHLY_SALARY = 250_000;

export const PERSONAL_LOAN_RATES = {
  initial: 11.5,
  concession1: 10.9,
  bestDirect: 10.9,
} as const;

export const HOME_LOAN_RATES = {
  initial: 10,
  concession1: 9,
  final: 8,
} as const;

export const BURGUNDY_RATES = HOME_LOAN_RATES;

export const DEFAULT_TENURE_MONTHS: Record<BurgundyLoanType, number> = {
  personal: 60,
  home: 25 * 12,
  car: 7 * 12,
  other: 48,
};

export const EMPTY_BURGUNDY_DISCOVERY: BurgundyDiscoveryState = {
  step: 'idle',
  customerType: 'burgundy',
};

export function getInitialRate(loanType?: BurgundyLoanType): number {
  return loanType === 'personal' ? PERSONAL_LOAN_RATES.initial : HOME_LOAN_RATES.initial;
}

export function emptyNegotiationFor(loanType?: BurgundyLoanType): BurgundyNegotiationState {
  const rate = getInitialRate(loanType);
  return {
    stage: 'initial',
    currentRatePct: rate,
    initialRatePct: rate,
    eligibleMaxAmount:
      loanType === 'personal'
        ? DEMO_PL_ELIGIBLE_MAX
        : loanType === 'home'
          ? DEMO_HOME_ELIGIBLE_MAX
          : undefined,
  };
}

export const EMPTY_BURGUNDY_NEGOTIATION: BurgundyNegotiationState = emptyNegotiationFor('personal');

export function defaultTenureMonths(loanType?: BurgundyLoanType): number {
  return DEFAULT_TENURE_MONTHS[loanType ?? 'personal'];
}

export function formatTenureLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${months} months`;
}

export function loanTypeFromButtonId(id: string): BurgundyLoanType | undefined {
  const key = id.trim().toLowerCase();
  if (key === AXIS_BUTTON_IDS.LOAN_PERSONAL) return 'personal';
  if (key === AXIS_BUTTON_IDS.LOAN_HOME) return 'home';
  if (key === AXIS_BUTTON_IDS.LOAN_CAR) return 'car';
  if (key === AXIS_BUTTON_IDS.LOAN_OTHER) return 'other';
  return undefined;
}

export function loanTypeLabel(type?: BurgundyLoanType): string {
  switch (type) {
    case 'personal':
      return 'Personal Loan';
    case 'home':
      return 'Home Loan';
    case 'car':
      return 'Car Loan';
    default:
      return 'Loan';
  }
}

export function parseTenureYears(text: string): number | undefined {
  const yearMatch = text.match(/(\d+)\s*(?:year|yr|saal)/i);
  if (yearMatch) {
    const months = Number(yearMatch[1]) * 12;
    if (months >= 12 && months <= 360) return months;
  }
  return parseTenureMonths(text);
}

export function parseLoanTypeFromText(text: string): BurgundyLoanType | undefined {
  const q = text.toLowerCase();
  if (/personal loan|personal\b/.test(q)) return 'personal';
  if (/home loan|house loan|for my house|for a house|for house|ghar|property/.test(q)) return 'home';
  if (/car loan|vehicle|auto loan|gaadi/.test(q)) return 'car';
  return undefined;
}

export function parseLoanPurpose(text: string, loanType?: BurgundyLoanType): string | undefined {
  if (loanType === 'personal') return 'Personal use';
  const q = text.toLowerCase();
  if (/house|home|property|flat|apartment|ghar/.test(q)) return 'Home purchase';
  if (/car|vehicle|auto|gaadi/.test(q)) return 'Vehicle purchase';
  if (loanType === 'home') return 'Home purchase';
  if (loanType === 'car') return 'Vehicle purchase';
  if (text.trim().length >= 3 && text.trim().length <= 50) return text.trim();
  return undefined;
}

export function parseBurgundyRequirement(
  text: string,
  loanType?: BurgundyLoanType,
): Partial<BurgundyDiscoveryState> {
  const detectedType = parseLoanTypeFromText(text) ?? loanType;
  const amount = parseLoanAmount(text);
  const tenureMonths =
    parseTenureYears(text) ?? (detectedType ? defaultTenureMonths(detectedType) : undefined);
  const purpose = parseLoanPurpose(text, detectedType);
  const partial: Partial<BurgundyDiscoveryState> = { customerType: 'burgundy' };
  if (detectedType) partial.loanType = detectedType;
  if (amount) partial.loanAmount = amount;
  if (purpose) partial.loanPurpose = purpose;
  if (tenureMonths) partial.tenureMonths = tenureMonths;
  return partial;
}

export function hasClearRequirement(state: Partial<BurgundyDiscoveryState>): boolean {
  if (!state.loanAmount) return false;
  if (state.loanType === 'personal') return true;
  return Boolean(state.loanType || state.loanPurpose);
}

export function mergeDiscoveryToNegotiation(
  discovery: BurgundyDiscoveryState,
  negotiation: BurgundyNegotiationState = emptyNegotiationFor(discovery.loanType),
): BurgundyNegotiationState {
  const loanType = discovery.loanType ?? negotiation.loanType;
  return {
    ...negotiation,
    loanType,
    loanAmount: discovery.loanAmount ?? negotiation.loanAmount,
    loanPurpose: discovery.loanPurpose ?? negotiation.loanPurpose,
    tenureMonths:
      discovery.tenureMonths ??
      negotiation.tenureMonths ??
      defaultTenureMonths(loanType),
    eligibleMaxAmount:
      loanType === 'personal'
        ? (negotiation.eligibleMaxAmount ?? DEMO_PL_ELIGIBLE_MAX)
        : loanType === 'home'
          ? (negotiation.eligibleMaxAmount ?? DEMO_HOME_ELIGIBLE_MAX)
          : negotiation.eligibleMaxAmount,
  };
}

export function detectPriceObjection(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /too (?:high|much|expensive)|rate (?:is )?still|interest (?:is )?too|still too|not enough|reduce|lower|better|cheaper|discount/.test(
      q,
    ) ||
    /mehnga|zyada|kam karo/.test(q) ||
    /\d+\.?\d*\s*%/.test(q)
  );
}

export function detectCompetitorMention(text: string): boolean {
  return /another bank|other bank|competitor|hdfc|icici|sbi|kotak|get \d+\.?\d*\s*%/.test(
    text.toLowerCase(),
  );
}

export function detectRelationshipPushback(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /old customer|long.?standing|loyal|burgundy|best offer|best rate|relationship|help me with|purana customer|banking with axis|been banking|many years|been with axis|\d+\s*years/.test(
      q,
    ) || /i'?m your|surely you can/.test(q)
  );
}

export function detectHardRateDemand(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /9\.75|9\.5|9\.50|give me \d+\.?\d*|take it from axis|isn'?t enough|otherwise i/.test(q) ||
    (/take it|i'?ll take/.test(q) && /axis|from you/.test(q))
  );
}

export function detectWhatCanYouDo(text: string): boolean {
  return /what can you do|okay\.?\s*what|tell me the rate|how much can|kya kar sakte/.test(
    text.toLowerCase(),
  );
}

export function detectExceptionAcceptance(text: string): boolean {
  return /^(fine|ok|okay|yes|go ahead|do that|please do|theek hai|haan)\b|request.*exception|raise.*request/.test(
    text.toLowerCase(),
  );
}

export function detectApplicationAcceptance(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /^(yes|proceed|let'?s go|start)\b/.test(q) ||
    /proceed with (?:the )?application|want to apply|start (?:loan )?application|comfortable proceeding|take you forward/.test(
      q,
    )
  );
}

export function detectThinkingPause(text: string): boolean {
  return /let me think|need time|will decide|soch(?:ta|ungi)|baad mein|later/i.test(text);
}

export function detectNotInterested(text: string): boolean {
  return /not interested|no thanks|don't want|dont want|leave me|stop|nah\b|nahi chahiye/.test(
    text.toLowerCase(),
  );
}

export function isEscalationFollowUpDue(
  negotiation: BurgundyNegotiationState,
  waitMs: number,
  now = Date.now(),
): boolean {
  if (negotiation.loanType === 'personal') return false;
  if (negotiation.stage !== 'escalation_pending' || !negotiation.escalationAt) return false;
  return now - negotiation.escalationAt >= waitMs;
}

export function formatEmiDisplay(amount: number, ratePct: number, tenureMonths: number): string {
  const emi = Math.round(estimateEmi(amount, ratePct, tenureMonths));
  return `₹${emi.toLocaleString('en-IN')}`;
}

export function generateReviewReferenceId(
  loanType?: BurgundyLoanType,
  date = new Date(),
): string {
  const prefix =
    loanType === 'car' ? 'AXB-CL' : loanType === 'personal' ? 'AXB-PL' : 'AXB-HL';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${prefix}-${dd}${mm}${yyyy}`;
}

export function buildImageHeaderResponse(imageUrl: string, caption: string): BotResponse {
  return {
    mode: 'image',
    media: { url: imageUrl, caption: formatWhatsAppText(caption) },
  };
}

export function buildBurgundyWelcomeSequence(
  customerName?: string,
  welcomeImageUrl?: string,
): BotResponse[] {
  const salutation = customerName?.trim() ? `, ${customerName.trim()}` : '';
  const messages: BotResponse[] = [];

  if (welcomeImageUrl?.trim()) {
    messages.push(
      buildImageHeaderResponse(welcomeImageUrl.trim(), 'Financing designed around your goals'),
    );
  }

  messages.push({
    mode: 'list',
    text: formatWhatsAppText(
      `${WA_EMOJI.welcome} Welcome back${salutation}!\n\n` +
        `As one of our valued long-standing Axis customers, you have access to *pre-qualified, preferential loan offers*.\n\n` +
        `Which loan can I help you with today?`,
    ),
    buttonTitle: 'Loan options',
    sections: [
      {
        title: 'Explore financing',
        rows: [
          {
            id: AXIS_BUTTON_IDS.LOAN_PERSONAL,
            title: 'Personal Loan',
            description: 'Unsecured — up to eligible limit',
          },
          {
            id: AXIS_BUTTON_IDS.LOAN_HOME,
            title: 'Home Loan',
            description: 'Property financing',
          },
          {
            id: AXIS_BUTTON_IDS.LOAN_CAR,
            title: 'Car Loan',
            description: 'Vehicle financing',
          },
          {
            id: AXIS_BUTTON_IDS.LOAN_OTHER,
            title: 'Something else',
            description: 'Describe your requirement',
          },
        ],
      },
    ],
  });

  return messages;
}

export function buildBurgundyWelcome(customerName?: string): BotResponse {
  return buildBurgundyWelcomeSequence(customerName).slice(-1)[0]!;
}

export function buildLoanRequirementPrompt(loanType: BurgundyLoanType): BotResponse {
  if (loanType === 'personal') {
    return {
      mode: 'text',
      text: formatWhatsAppText(
        `Of course. How much are you looking for?\n\n` + `_For example: ₹10 lakh_`,
      ),
    };
  }
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `Of course. Please share the *amount* and *tenure* you have in mind.\n\n` +
        `_For example: ₹50 lakh over 25 years_`,
    ),
  };
}

function firstName(ctx: BurgundyNegotiationState): string {
  const name = ctx.customerName?.trim();
  if (!name) return '';
  const parts = name.replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(/\s+/);
  return parts[0] ?? '';
}

function formatSalaryShort(monthly: number): string {
  const lakh = monthly / 100_000;
  return lakh % 1 === 0 ? `₹${lakh.toFixed(0)}L/mo` : `₹${lakh.toFixed(1)}L/mo`;
}

function standardOfferButtons(): Array<{ id: string; title: string }> {
  return [
    { id: AXIS_BUTTON_IDS.IMPROVE_OFFER, title: 'Improve Rate' },
    { id: AXIS_BUTTON_IDS.SUBMIT_REVIEW, title: 'Submit Review' },
    { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
  ];
}

function postConcessionButtons(): Array<{ id: string; title: string }> {
  return [
    { id: AXIS_BUTTON_IDS.IMPROVE_OFFER, title: 'Need Better Rate' },
    { id: AXIS_BUTTON_IDS.PROCEED_OFFER, title: 'Proceed' },
    { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
  ];
}

function isPersonalLoanFlow(neg: BurgundyNegotiationState): boolean {
  return neg.loanType === 'personal' || neg.loanType === undefined;
}

export function buildInitialOfferResponse(ctx: BurgundyNegotiationState): BotResponse {
  if (isPersonalLoanFlow(ctx) && ctx.loanType !== 'home' && ctx.loanType !== 'car') {
    return buildPersonalInitialOffer(ctx);
  }
  return buildHomeInitialOffer(ctx);
}

function buildPersonalInitialOffer(ctx: BurgundyNegotiationState): BotResponse {
  const amount = ctx.loanAmount ?? 1_200_000;
  const eligibleMax = ctx.eligibleMaxAmount ?? DEMO_PL_ELIGIBLE_MAX;
  const tenure = ctx.tenureMonths ?? defaultTenureMonths(ctx.loanType);
  const rate = PERSONAL_LOAN_RATES.initial;
  const name = firstName(ctx);
  const greeting = name ? `Happy to help, ${name}.` : `Happy to help.`;

  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      [
        greeting,
        '',
        `Based on your income and your relationship with Axis, you're *pre-qualified up to ${formatInr(eligibleMax)}*.`,
        '',
        `For your *${formatInr(amount)}*:`,
        `• *Rate:* ${rate}% p.a.`,
        `• *EMI:* ~${formatEmiDisplay(amount, rate, tenure)}/month (${formatTenureLabel(tenure)})`,
        '',
        `Shall we proceed, or would you like a better rate?`,
      ].join('\n'),
    ),
    buttons: standardOfferButtons(),
  };
}

function buildHomeInitialOffer(ctx: BurgundyNegotiationState): BotResponse {
  const amount = ctx.loanAmount ?? 5_000_000;
  const tenure = ctx.tenureMonths ?? defaultTenureMonths(ctx.loanType);
  const rate = HOME_LOAN_RATES.initial;
  const eligibleMax = ctx.eligibleMaxAmount ?? DEMO_HOME_ELIGIBLE_MAX;
  const name = firstName(ctx);
  const greeting = name ? `Happy to help, ${name}.` : `Happy to help.`;

  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      [
        greeting,
        '',
        `Based on your income and Axis relationship, you're *pre-qualified up to ${formatInr(eligibleMax)}*.`,
        '',
        `For your *${formatInr(amount)}*:`,
        `• *Rate:* ${rate}% p.a.`,
        `• *EMI:* ~${formatEmiDisplay(amount, rate, tenure)}/month (${formatTenureLabel(tenure)})`,
        '',
        `Shall we proceed, or would you like a better rate?`,
      ].join('\n'),
    ),
    buttons: standardOfferButtons(),
  };
}

export function buildConcession1Response(ctx: BurgundyNegotiationState): BotResponse {
  const isHome = ctx.loanType === 'home' || ctx.loanType === 'car';
  const appliedRate = isHome ? HOME_LOAN_RATES.concession1 : PERSONAL_LOAN_RATES.concession1;
  const prev = ctx.initialRatePct ?? (isHome ? HOME_LOAN_RATES.initial : PERSONAL_LOAN_RATES.initial);
  const amount = ctx.loanAmount ?? (isHome ? 5_000_000 : 1_200_000);
  const tenure = ctx.tenureMonths ?? defaultTenureMonths(ctx.loanType);

  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      [
        `I completely understand — and your long relationship with Axis genuinely counts here.`,
        '',
        `I've applied a *relationship benefit* to your offer:`,
        `• *Revised rate:* ${appliedRate}% p.a. _(from ${prev}%)_`,
        `• *EMI:* ~${formatEmiDisplay(amount, appliedRate, tenure)}/month`,
        '',
        `This is the best rate I can extend directly. Shall we proceed?`,
      ].join('\n'),
    ),
    buttons: postConcessionButtons(),
  };
}

export function buildTeamReviewPromptResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      [
        `I completely understand wanting the sharpest possible rate.`,
        '',
        `This is the best I can offer *directly* on your profile. For anything further, I'd like to bring in your *Relationship Manager*, who can negotiate with you personally.`,
        '',
        `Shall I share your request with them?`,
      ].join('\n'),
    ),
    buttons: [
      { id: AXIS_BUTTON_IDS.SUBMIT_REVIEW, title: 'Submit for Review' },
      { id: AXIS_BUTTON_IDS.CALLBACK, title: 'Request Callback' },
      { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
    ],
  };
}

export function buildReviewSubmittedResponse(referenceId: string): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      [
        `Done — I've shared your request with your *Relationship Manager*.`,
        '',
        `• *Reference:* ${referenceId}`,
        `• They'll reach out shortly to take it forward.`,
        '',
        `_Please keep this reference handy._`,
      ].join('\n'),
    ),
    buttons: [
      { id: AXIS_BUTTON_IDS.MAIN_MENU, title: 'Main menu' },
      { id: AXIS_BUTTON_IDS.TYPE_QUESTION, title: 'Ask anything' },
      { id: AXIS_BUTTON_IDS.CALLBACK, title: 'Request Callback' },
    ],
  };
}

export function buildSpeakToExpertResponse(role: 'expert' | 'rm' = 'expert'): BotResponse {
  const label = role === 'rm' ? 'Relationship Manager' : 'loan specialist';
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `I'll connect you with your *${label}*.\n\n` +
        `_Demo — this would schedule a callback in production._`,
    ),
    buttons: [
      { id: AXIS_BUTTON_IDS.CALLBACK, title: 'Request Callback' },
      { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
      { id: AXIS_BUTTON_IDS.MAIN_MENU, title: 'Main menu' },
    ],
  };
}

export function buildFinalPreferentialOfferResponse(ctx: BurgundyNegotiationState): BotResponse {
  const amount = ctx.loanAmount ?? 5_000_000;
  const tenure = ctx.tenureMonths ?? defaultTenureMonths(ctx.loanType);
  const rate = HOME_LOAN_RATES.final;
  const name = firstName(ctx);
  const greeting = name ? `Good news, ${name}.` : `Good news.`;

  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      [
        greeting,
        '',
        `Your Relationship Manager has improved your offer:`,
        `• *Amount:* ${formatInr(amount)}`,
        `• *Rate:* ${rate}% p.a.`,
        `• *EMI:* ~${formatEmiDisplay(amount, rate, tenure)}/month`,
        '',
        `Shall we continue with the application?`,
      ].join('\n'),
    ),
    buttons: [
      { id: AXIS_BUTTON_IDS.APPLY_LOAN, title: 'Start Application' },
      { id: AXIS_BUTTON_IDS.CALLBACK, title: 'Request Callback' },
      { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
    ],
  };
}

export function buildBurgundyFollowUpSequence(
  ctx: BurgundyNegotiationState,
  followUpImageUrl?: string,
): BotResponse[] {
  const messages: BotResponse[] = [];
  if (followUpImageUrl?.trim()) {
    messages.push(buildImageHeaderResponse(followUpImageUrl.trim(), 'Your Loan Offer Update'));
  }
  messages.push(buildFinalPreferentialOfferResponse(ctx));
  return messages;
}

export function buildFinalOfferHoldResponse(ctx: BurgundyNegotiationState): BotResponse {
  const rate = ctx.currentRatePct;
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `*${rate}% p.a.* is the best rate available on your profile right now.\n\n` +
        `Would you like to proceed, or should I arrange a callback?`,
    ),
    buttons: [
      { id: AXIS_BUTTON_IDS.APPLY_LOAN, title: 'Start Application' },
      { id: AXIS_BUTTON_IDS.CALLBACK, title: 'Request Callback' },
      { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
    ],
  };
}

export function buildChangeLoanDetailsPrompt(loanType?: BurgundyLoanType): BotResponse {
  return buildLoanRequirementPrompt(loanType ?? 'personal');
}

export function buildApplicationStartResponse(): BotResponse {
  return {
    mode: 'text',
    text: formatWhatsAppText(
      `Excellent — let's proceed with your application.\n\n` +
        `_Final approval and terms are subject to eligibility and verification._`,
    ),
  };
}

export function buildThinkingPauseResponse(): BotResponse {
  return {
    mode: 'buttons',
    text: formatWhatsAppText(
      `Of course, take your time. Your offer details are saved here for whenever you're ready.`,
    ),
    buttons: [
      { id: AXIS_BUTTON_IDS.REVIEW_LOAN, title: 'View Details' },
      { id: AXIS_BUTTON_IDS.APPLY_LOAN, title: 'Start Application' },
    ],
  };
}

export function buildOfferDetailsResponse(ctx: BurgundyNegotiationState): BotResponse {
  const amount = ctx.loanAmount ?? 1_200_000;
  const tenure = ctx.tenureMonths ?? defaultTenureMonths(ctx.loanType);
  const rate = ctx.currentRatePct;
  const eligibleMax =
    ctx.eligibleMaxAmount ??
    (ctx.loanType === 'home' ? DEMO_HOME_ELIGIBLE_MAX : DEMO_PL_ELIGIBLE_MAX);
  const lines = [
    `*${loanTypeLabel(ctx.loanType)} — your offer*`,
    '',
    `• *Amount:* ${formatInr(amount)}`,
    `• *Pre-qualified up to:* ${formatInr(eligibleMax)}`,
    `• *Rate:* ${rate}% p.a.`,
    `• *EMI:* ~${formatEmiDisplay(amount, rate, tenure)}/month (${formatTenureLabel(tenure)})`,
  ];

  return {
    mode: 'buttons',
    text: formatWhatsAppText(lines.join('\n')),
    buttons: standardOfferButtons(),
  };
}

export type BurgundyAdvanceResult =
  | {
      kind: 'update';
      negotiation: BurgundyNegotiationState;
      responses: BotResponse[];
    }
  | { kind: 'noop'; negotiation: BurgundyNegotiationState };

function personalNegotiation(
  negotiation: BurgundyNegotiationState,
  text: string,
): BurgundyAdvanceResult {
  if (negotiation.stage === 'escalation_pending' || negotiation.stage === 'review_prompt') {
    return { kind: 'noop', negotiation };
  }

  const pushback =
    detectPriceObjection(text) ||
    detectCompetitorMention(text) ||
    detectRelationshipPushback(text) ||
    detectHardRateDemand(text);

  if (negotiation.stage === 'concession_1' && pushback) {
    return {
      kind: 'update',
      negotiation: { ...negotiation, stage: 'review_prompt' },
      responses: [buildTeamReviewPromptResponse()],
    };
  }

  if (negotiation.stage === 'initial' && pushback) {
    return {
      kind: 'update',
      negotiation: {
        ...negotiation,
        stage: 'concession_1',
        currentRatePct: PERSONAL_LOAN_RATES.concession1,
        relationshipConcessionGiven: true,
      },
      responses: [buildConcession1Response(negotiation)],
    };
  }

  return { kind: 'noop', negotiation };
}

function homeNegotiation(
  negotiation: BurgundyNegotiationState,
  text: string,
): BurgundyAdvanceResult {
  const pushback = detectRelationshipPushback(text);
  const objection = detectPriceObjection(text);

  if (negotiation.stage === 'final' || negotiation.finalOfferDelivered) {
    if (objection || pushback) {
      return {
        kind: 'update',
        negotiation,
        responses: [buildFinalOfferHoldResponse(negotiation)],
      };
    }
    return { kind: 'noop', negotiation };
  }

  if (negotiation.stage === 'escalation_pending' || negotiation.stage === 'review_prompt') {
    return { kind: 'noop', negotiation };
  }

  if (negotiation.stage === 'concession_1' && (pushback || objection)) {
    return {
      kind: 'update',
      negotiation: { ...negotiation, stage: 'review_prompt' },
      responses: [buildTeamReviewPromptResponse()],
    };
  }

  if (negotiation.stage === 'initial' && (objection || pushback)) {
    return {
      kind: 'update',
      negotiation: {
        ...negotiation,
        stage: 'concession_1',
        currentRatePct: HOME_LOAN_RATES.concession1,
        relationshipConcessionGiven: true,
      },
      responses: [buildConcession1Response(negotiation)],
    };
  }

  return { kind: 'noop', negotiation };
}

export function advanceBurgundyNegotiation(
  negotiation: BurgundyNegotiationState,
  text: string,
): BurgundyAdvanceResult {
  if (negotiation.loanType === 'home' || negotiation.loanType === 'car') {
    return homeNegotiation(negotiation, text);
  }
  return personalNegotiation(negotiation, text);
}

export function submitBurgundyReview(
  negotiation: BurgundyNegotiationState,
): { negotiation: BurgundyNegotiationState; response: BotResponse } {
  const referenceId =
    negotiation.reviewReferenceId ?? generateReviewReferenceId(negotiation.loanType);
  return {
    negotiation: {
      ...negotiation,
      stage: 'escalation_pending',
      escalationTriggered: true,
      escalationAt: Date.now(),
      reviewSubmitted: true,
      reviewReferenceId: referenceId,
    },
    response: buildReviewSubmittedResponse(referenceId),
  };
}

export function requestPersonalException(
  negotiation: BurgundyNegotiationState,
): { negotiation: BurgundyNegotiationState; responses: BotResponse[] } {
  return {
    negotiation: { ...negotiation, stage: 'review_prompt' },
    responses: [buildTeamReviewPromptResponse()],
  };
}

export function deliverFinalException(
  negotiation: BurgundyNegotiationState,
  followUpImageUrl?: string,
): { negotiation: BurgundyNegotiationState; responses: BotResponse[] } {
  const updated: BurgundyNegotiationState = {
    ...negotiation,
    stage: 'final',
    currentRatePct: HOME_LOAN_RATES.final,
    finalOfferDelivered: true,
  };
  return {
    negotiation: updated,
    responses: buildBurgundyFollowUpSequence(updated, followUpImageUrl),
  };
}

export function formatBurgundyContextForLlm(
  discovery?: BurgundyDiscoveryState,
  negotiation?: BurgundyNegotiationState,
): string {
  const parts: string[] = [
    'customer: Axis Burgundy existing relationship',
    `demo salary ${formatSalaryShort(DEMO_MONTHLY_SALARY)}`,
    `${DEMO_RELATIONSHIP_YEARS}-year relationship`,
    'agentic AI has pre-scanned eligibility from profile signals',
  ];
  if (discovery?.loanType) parts.push(`loan type: ${loanTypeLabel(discovery.loanType)}`);
  if (discovery?.loanAmount) parts.push(`amount ${formatInr(discovery.loanAmount)}`);
  if (negotiation?.eligibleMaxAmount)
    parts.push(`eligible up to ${formatInr(negotiation.eligibleMaxAmount)}`);
  if (negotiation?.currentRatePct) parts.push(`current demo rate ${negotiation.currentRatePct}%`);
  if (negotiation?.stage) parts.push(`negotiation stage: ${negotiation.stage}`);
  return `\nCUSTOMER_CONTEXT (remember — do not re-ask): ${parts.join('; ')}.\n`;
}

// Legacy aliases for tests / axis-negotiation re-exports
export function buildRelationshipConcessionResponse(
  ctx: BurgundyNegotiationState,
  _previousRate: number,
): BotResponse {
  return buildConcession1Response(ctx);
}

export function buildEmiDetailResponse(ctx: BurgundyNegotiationState): BotResponse {
  return buildOfferDetailsResponse(ctx);
}
