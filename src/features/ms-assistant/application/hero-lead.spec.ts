import { describe, expect, it } from 'vitest';
import {
  extractLeadFieldsFromText,
  inferLeadStepFromAssistantTurn,
  looksLikeLeadFieldReply,
  prepareHeroLeadFromContext,
  shouldOfferLeadCapture,
  shouldStartInlineLeadAsk,
  smartAdvanceHeroLead,
} from './hero-lead';

describe('hero-lead', () => {
  it('starts quote flow at location step without pre-filled city from context', () => {
    const lead = prepareHeroLeadFromContext('quote', {
      modelInterest: 'Splendor+',
      contactName: 'Rahul',
    });
    expect(lead.step).toBe('location');
    expect(lead.location).toBeUndefined();
    expect(lead.name).toBe('Rahul');
  });

  it('extracts pin code from plain number message', () => {
    expect(extractLeadFieldsFromText('411001')).toEqual({
      pinCode: '411001',
      phone: undefined,
    });
  });

  it('extracts combined location and pin code', () => {
    const fields = extractLeadFieldsFromText('Pune, 411001');
    expect(fields.location).toBe('Pune');
    expect(fields.pinCode).toBe('411001');
  });

  it('advances from location to pincode step', () => {
    const result = smartAdvanceHeroLead({ step: 'location', intent: 'quote' }, 'Pune');
    expect(result.kind).toBe('prompt');
    if (result.kind === 'prompt') {
      expect(result.lead.location).toBe('Pune');
      expect(result.lead.step).toBe('pincode');
      expect(result.response.text).toContain('PIN code');
    }
  });

  it('completes lead when pin code is provided', () => {
    const result = smartAdvanceHeroLead(
      { step: 'pincode', intent: 'quote', location: 'Pune', modelInterest: 'Splendor+' },
      '411001',
    );
    expect(result.kind).toBe('complete');
    if (result.kind === 'complete') {
      expect(result.lead.pinCode).toBe('411001');
      expect(result.response.text).toContain('Pune');
    }
  });

  it('rejects mileage text as location', () => {
    const result = smartAdvanceHeroLead({ step: 'location', intent: 'quote' }, 'best mileage');
    expect(result.kind).toBe('invalid');
  });

  it('infers pincode step from prior assistant prompt', () => {
    const step = inferLeadStepFromAssistantTurn([
      { role: 'user', content: 'hero_get_quote', at: 1 },
      { role: 'assistant', content: "Thanks — noted *Pune*.\n\nWhat's your *6-digit PIN code*?", at: 2 },
    ]);
    expect(step).toBe('pincode');
  });

  it('does not infer lead step after product recommendation reply', () => {
    const step = inferLeadStepFromAssistantTurn([
      { role: 'user', content: 'Which model is best for me under 1 lac?', at: 1 },
      {
        role: 'assistant',
        content:
          'Under ₹1L, Splendor+ and Xtreme 125R are strong picks.\n\nWant a city-wise quote? Tap below.',
        at: 2,
      },
    ]);
    expect(step).toBeUndefined();
  });

  it('detects lead field reply for pincode step', () => {
    expect(looksLikeLeadFieldReply('411001', 'pincode')).toBe(true);
  });

  it('does not offer lead capture on recommendation question', () => {
    expect(
      shouldOfferLeadCapture('Which model is best for me under 1 lac?', []),
    ).toBe(false);
  });

  it('does not start inline lead ask (button-only flow)', () => {
    expect(shouldStartInlineLeadAsk('Send me on-road quote for Splendor in Pune')).toBe(false);
  });

  it('does not treat recommendation question as lead field reply', () => {
    expect(
      looksLikeLeadFieldReply('Which model is best for me under 1 lac?', 'location'),
    ).toBe(false);
  });
});
