import { describe, expect, it } from 'vitest';
import {
  parseLoanAmount,
  parseTenureMonths,
  prepareAxisLeadFromContext,
  smartAdvanceAxisLead,
} from './axis-lead';

describe('axis-lead', () => {
  it('starts lead at amount step', () => {
    const lead = prepareAxisLeadFromContext({});
    expect(lead.step).toBe('amount');
  });

  it('parses lakh amounts', () => {
    expect(parseLoanAmount('5 lakh')).toBe(500_000);
    expect(parseTenureMonths('36')).toBe(36);
  });

  it('advances through amount and tenure', () => {
    const r1 = smartAdvanceAxisLead({ step: 'amount', intent: 'apply' }, '5 lakh');
    expect(r1.kind).toBe('prompt');
    if (r1.kind === 'prompt') {
      expect(r1.lead.loanAmount).toBe(500_000);
      expect(r1.lead.step).toBe('tenure');
    }

    const r2 = smartAdvanceAxisLead(
      { step: 'tenure', intent: 'apply', loanAmount: 500_000 },
      '48',
    );
    expect(r2.kind).toBe('prompt');
    if (r2.kind === 'prompt') {
      expect(r2.lead.tenureMonths).toBe(48);
      expect(r2.lead.step).toBe('location');
    }
  });

  it('completes lead on pincode', () => {
    const result = smartAdvanceAxisLead(
      {
        step: 'pincode',
        intent: 'apply',
        loanAmount: 500_000,
        tenureMonths: 36,
        location: 'Pune',
      },
      '411001',
    );
    expect(result.kind).toBe('complete');
  });
});
