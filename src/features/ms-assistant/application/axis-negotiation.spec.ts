import { describe, expect, it } from 'vitest';
import {
  detectPriceObjection,
  estimateEmi,
  formatInr,
  getDemoOffer,
  HOME_LOAN_RATES,
  PERSONAL_LOAN_RATES,
  stageToLevel,
} from './axis-negotiation';

describe('axis-negotiation', () => {
  it('detects price objection phrases', () => {
    expect(detectPriceObjection('Rate is too high')).toBe(true);
    expect(detectPriceObjection('What is the EMI for 5 lakh?')).toBe(false);
  });

  it('maps burgundy stages to demo offer levels', () => {
    expect(getDemoOffer(0, 'home').ratePct).toBe(HOME_LOAN_RATES.initial);
    expect(getDemoOffer(1, 'home').ratePct).toBe(HOME_LOAN_RATES.concession1);
    expect(getDemoOffer(2, 'home').ratePct).toBe(HOME_LOAN_RATES.final);
    expect(getDemoOffer(0, 'personal').ratePct).toBe(PERSONAL_LOAN_RATES.initial);
    expect(getDemoOffer(1, 'personal').ratePct).toBe(PERSONAL_LOAN_RATES.concession1);
    expect(getDemoOffer(2, 'personal').ratePct).toBe(PERSONAL_LOAN_RATES.bestDirect);
    expect(stageToLevel('concession_1')).toBe(1);
  });

  it('estimates EMI for demo home loan amounts', () => {
    const emi = estimateEmi(5_000_000, 10, 300);
    expect(emi).toBeGreaterThan(40_000);
    expect(formatInr(5_000_000)).toContain('lakh');
  });
});
