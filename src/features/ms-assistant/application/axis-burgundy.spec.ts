import { describe, expect, it } from 'vitest';
import {
  advanceBurgundyNegotiation,
  detectPriceObjection,
  detectRelationshipPushback,
  EMPTY_BURGUNDY_NEGOTIATION,
  formatEmiDisplay,
  generateReviewReferenceId,
  hasClearRequirement,
  HOME_LOAN_RATES,
  isEscalationFollowUpDue,
  parseBurgundyRequirement,
  PERSONAL_LOAN_RATES,
  requestPersonalException,
  submitBurgundyReview,
} from './axis-burgundy';

describe('axis-burgundy', () => {
  it('parses home loan requirement from natural text', () => {
    const partial = parseBurgundyRequirement(
      'I need a loan of ₹50 lakh for a house. I am considering a tenure of 25 years.',
    );
    expect(partial.loanAmount).toBe(5_000_000);
    expect(partial.loanType).toBe('home');
    expect(partial.tenureMonths).toBe(300);
    expect(hasClearRequirement(partial)).toBe(true);
  });

  it('parses personal loan amount from natural text', () => {
    const partial = parseBurgundyRequirement('Personal loan. I need around ₹12 lakh.');
    expect(partial.loanAmount).toBe(1_200_000);
    expect(partial.loanType).toBe('personal');
    expect(hasClearRequirement(partial)).toBe(true);
  });

  it('formats home loan EMI matching demo script', () => {
    expect(formatEmiDisplay(5_000_000, 10, 300)).toBe('₹45,435');
    expect(formatEmiDisplay(5_000_000, 9, 300)).toBe('₹41,960');
    expect(formatEmiDisplay(5_000_000, 8, 300)).toBe('₹38,591');
  });

  it('follows short personal loan flow: initial → concession → review', () => {
    let neg = {
      ...EMPTY_BURGUNDY_NEGOTIATION,
      loanType: 'personal' as const,
      loanAmount: 1_200_000,
    };

    const step1 = advanceBurgundyNegotiation(
      neg,
      '11.5% is still high. I can get 10.5% from another bank.',
    );
    expect(step1.kind).toBe('update');
    if (step1.kind !== 'update') return;
    expect(step1.negotiation.stage).toBe('concession_1');
    expect(step1.negotiation.currentRatePct).toBe(PERSONAL_LOAN_RATES.concession1);
    expect(step1.responses[0]?.text).toContain('relationship benefit');
    expect(step1.responses[0]?.text).toContain('10.9');

    const step2 = advanceBurgundyNegotiation(
      step1.negotiation,
      "I've been with Axis for 8 years. Can you do better?",
    );
    expect(step2.kind).toBe('update');
    if (step2.kind !== 'update') return;
    expect(step2.negotiation.stage).toBe('review_prompt');
    expect(step2.responses[0]?.text).toContain('Relationship Manager');
    expect(step2.responses[0]?.buttons?.some((b) => b.title.includes('Submit'))).toBe(true);

    const submitted = submitBurgundyReview(step2.negotiation);
    expect(submitted.negotiation.reviewSubmitted).toBe(true);
    expect(submitted.negotiation.reviewReferenceId).toMatch(/^AXB-PL-/);
    expect(submitted.response.text).toContain('Relationship Manager');
  });

  it('follows home loan negotiation ladder initial → concession → review prompt', () => {
    let neg = {
      ...EMPTY_BURGUNDY_NEGOTIATION,
      loanType: 'home' as const,
      loanAmount: 5_000_000,
      tenureMonths: 300,
      currentRatePct: HOME_LOAN_RATES.initial,
      initialRatePct: HOME_LOAN_RATES.initial,
    };

    const step1 = advanceBurgundyNegotiation(neg, 'The interest rate is too high');
    expect(step1.kind).toBe('update');
    if (step1.kind !== 'update') return;
    expect(step1.negotiation.currentRatePct).toBe(HOME_LOAN_RATES.concession1);

    const step2 = advanceBurgundyNegotiation(
      step1.negotiation,
      "I've been banking with Axis for many years. Can you help me with your best offer?",
    );
    expect(step2.kind).toBe('update');
    if (step2.kind !== 'update') return;
    expect(step2.negotiation.stage).toBe('review_prompt');
  });

  it('submits review with reference id and pending escalation', () => {
    const result = submitBurgundyReview({
      ...EMPTY_BURGUNDY_NEGOTIATION,
      loanType: 'home',
      stage: 'review_prompt',
    });
    expect(result.negotiation.reviewSubmitted).toBe(true);
    expect(result.negotiation.stage).toBe('escalation_pending');
    expect(result.negotiation.reviewReferenceId).toMatch(/^AXB-HL-/);
    expect(result.response.text).toContain('Relationship Manager');
  });

  it('routes exception request to team review prompt', () => {
    const result = requestPersonalException({
      ...EMPTY_BURGUNDY_NEGOTIATION,
      loanType: 'personal',
      loanAmount: 1_200_000,
      stage: 'concession_1',
    });
    expect(result.negotiation.stage).toBe('review_prompt');
    expect(result.responses[0]?.text).toContain('Relationship Manager');
  });

  it('generates reference id AXB-PL-DDMMYYYY for personal loans', () => {
    const id = generateReviewReferenceId('personal', new Date(2026, 7, 20));
    expect(id).toBe('AXB-PL-20082026');
  });

  it('detects negotiation phrase helpers', () => {
    expect(detectRelationshipPushback('banking with Axis for many years')).toBe(true);
    expect(detectPriceObjection('The interest rate is too high')).toBe(true);
  });

  it('skips escalation follow-up for personal loans', () => {
    const neg = {
      ...EMPTY_BURGUNDY_NEGOTIATION,
      loanType: 'personal' as const,
      stage: 'escalation_pending' as const,
      escalationAt: Date.now() - 60_000,
    };
    expect(isEscalationFollowUpDue(neg, 30_000)).toBe(false);
  });

  it('detects when home loan escalation follow-up is due', () => {
    const neg = {
      ...EMPTY_BURGUNDY_NEGOTIATION,
      loanType: 'home' as const,
      stage: 'escalation_pending' as const,
      escalationAt: Date.now() - 60_000,
    };
    expect(isEscalationFollowUpDue(neg, 30_000)).toBe(true);
  });
});
