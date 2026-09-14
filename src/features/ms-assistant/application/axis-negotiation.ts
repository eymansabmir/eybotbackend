import type { BotResponse } from '../domain/bot-response';
import {
  HOME_LOAN_RATES,
  PERSONAL_LOAN_RATES,
  buildFinalOfferHoldResponse,
  buildFinalPreferentialOfferResponse,
  buildRelationshipConcessionResponse,
  type BurgundyNegotiationState,
  type BurgundyStage,
} from './axis-burgundy';

export type { BurgundyNegotiationState as AxisNegotiationState } from './axis-burgundy';
export { EMPTY_BURGUNDY_NEGOTIATION as EMPTY_AXIS_NEGOTIATION } from './axis-burgundy';
export {
  detectPriceObjection,
  detectRelationshipPushback,
  advanceBurgundyNegotiation,
  deliverFinalException,
  isEscalationFollowUpDue,
  BURGUNDY_RATES,
  PERSONAL_LOAN_RATES,
  HOME_LOAN_RATES,
} from './axis-burgundy';

export type NegotiationLevel = 0 | 1 | 2 | 3;
export type ObjectionType = 'rate' | 'fee' | 'emi' | 'general';

export type DemoOfferTerms = {
  level: NegotiationLevel;
  ratePct: number;
  processingFeePct: number;
  label: string;
};

export function stageToLevel(stage: BurgundyStage): NegotiationLevel {
  switch (stage) {
    case 'initial':
      return 0;
    case 'concession_1':
      return 1;
    case 'best_direct':
    case 'exception_offered':
    case 'review_prompt':
    case 'escalation_pending':
      return 2;
    case 'exception_requested':
    case 'ready_to_apply':
    case 'final':
      return 3;
    default:
      return 0;
  }
}

export function getDemoOffer(level: NegotiationLevel, loanType?: string): DemoOfferTerms {
  const isPersonal = loanType === 'personal' || !loanType;
  const rate = isPersonal
    ? level === 0
      ? PERSONAL_LOAN_RATES.initial
      : level === 1
        ? PERSONAL_LOAN_RATES.concession1
        : PERSONAL_LOAN_RATES.bestDirect
    : level === 0
      ? HOME_LOAN_RATES.initial
      : level === 1
        ? HOME_LOAN_RATES.concession1
        : HOME_LOAN_RATES.final;
  return {
    level,
    ratePct: rate,
    processingFeePct: 1,
    label: 'Demo offer',
  };
}

export function formatInr(amount: number): string {
  if (amount >= 100_000) {
    const lakh = amount / 100_000;
    return lakh % 1 === 0 ? `₹${lakh.toFixed(0)} lakh` : `₹${lakh.toFixed(2)} lakh`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function estimateEmi(principal: number, annualRatePct: number, tenureMonths: number): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / tenureMonths;
  const factor = Math.pow(1 + r, tenureMonths);
  return (principal * r * factor) / (factor - 1);
}

export function estimateTotalInterest(
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): number {
  const emi = estimateEmi(principal, annualRatePct, tenureMonths);
  return Math.max(0, emi * tenureMonths - principal);
}

export function classifyObjection(text: string): ObjectionType {
  const q = text.toLowerCase();
  if (/processing fee|upfront fee|fee too|waive.*fee/.test(q)) return 'fee';
  if (/emi|monthly|afford|too much per month/.test(q)) return 'emi';
  if (/rate|interest|expensive|discount|cheaper|competitor/.test(q)) return 'rate';
  return 'general';
}

export function mergeNegotiationContext(
  negotiation: BurgundyNegotiationState,
  lead?: { loanAmount?: number; tenureMonths?: number; purpose?: string },
  discovery?: { loanAmount?: number; tenureMonths?: number; loanPurpose?: string; loanType?: string },
): BurgundyNegotiationState {
  return {
    ...negotiation,
    loanAmount: lead?.loanAmount ?? discovery?.loanAmount ?? negotiation.loanAmount,
    tenureMonths: lead?.tenureMonths ?? discovery?.tenureMonths ?? negotiation.tenureMonths,
    loanPurpose: discovery?.loanPurpose ?? lead?.purpose ?? negotiation.loanPurpose,
    loanType: (discovery?.loanType as BurgundyNegotiationState['loanType']) ?? negotiation.loanType,
  };
}

export function buildNegotiationResponse(
  _offer: DemoOfferTerms,
  opts: {
    negotiation?: BurgundyNegotiationState;
  },
): BotResponse {
  const neg = opts.negotiation;
  if (!neg) {
    return buildRelationshipConcessionResponse(
      {
        stage: 'concession_1',
        currentRatePct: PERSONAL_LOAN_RATES.concession1,
        initialRatePct: PERSONAL_LOAN_RATES.initial,
      },
      PERSONAL_LOAN_RATES.initial,
    );
  }
  if (neg.stage === 'final' || neg.finalOfferDelivered) {
    return buildFinalOfferHoldResponse(neg);
  }
  if (neg.stage === 'concession_1') {
    return buildRelationshipConcessionResponse(neg, neg.initialRatePct);
  }
  return buildFinalPreferentialOfferResponse(neg);
}
