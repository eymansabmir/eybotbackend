import { describe, expect, it } from 'vitest';
import {
  isGreetingText,
  buildWelcomeResponse,
  buildOfferingsResponse,
  buildFaqMenuResponse,
  buildHandoffMenuResponse,
  offeringQueryForId,
  cannedAnswerForId,
  resolveMenuSelection,
  truncateWhatsAppBody,
  MS_BUTTON_IDS,
  MS_TOPIC_IDS,
  MS_FAQ_IDS,
  MS_HANDOFF_IDS,
} from './greeting';

describe('ms-assistant greeting', () => {
  it('detects common greetings and menu keywords', () => {
    expect(isGreetingText('Hi')).toBe(true);
    expect(isGreetingText('menu')).toBe(true);
    expect(isGreetingText('What is SAP?')).toBe(false);
  });

  it('builds welcome list including Talk to an expert', () => {
    const welcome = buildWelcomeResponse();
    expect(welcome.mode).toBe('list');
    if (welcome.mode !== 'list') return;
    expect(welcome.text).toMatch(/Managed Services \(MS\)/);
    expect(welcome.text).toMatch(/type \*menu\*/i);
    const ids = welcome.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toEqual([
      MS_BUTTON_IDS.SERVICES,
      MS_BUTTON_IDS.OFFERINGS,
      MS_BUTTON_IDS.ASK,
      MS_BUTTON_IDS.HANDOFF,
    ]);
    expect(welcome.sections[0]?.rows.find((r) => r.id === MS_BUTTON_IDS.HANDOFF)?.title).toBe(
      'Talk to an expert',
    );
  });

  it('builds trigger themes with four-part canned cards', () => {
    const topics = buildOfferingsResponse();
    expect(topics.mode).toBe('list');
    if (topics.mode !== 'list') return;
    const ids = topics.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toContain(MS_TOPIC_IDS.CAPACITY);
    expect(ids).toContain(MS_TOPIC_IDS.WHEN_NOT);

    const capacity = cannedAnswerForId(MS_TOPIC_IDS.CAPACITY) ?? '';
    expect(capacity).toMatch(/\*Meaning:/i);
    expect(capacity).toMatch(/\*EY offer:/i);
    expect(capacity).toMatch(/\*Value:/i);
    expect(capacity).toMatch(/\*Discovery question:/i);
    expect(capacity).toMatch(/\*Client-facing opener:/i);
  });

  it('dedupes Guide & Ask away from qualification duplicates', () => {
    const faqs = buildFaqMenuResponse();
    expect(faqs.mode).toBe('list');
    if (faqs.mode !== 'list') return;
    const ids = faqs.sections[0]?.rows.map((r) => r.id) ?? [];
    expect(ids).toContain(MS_BUTTON_IDS.TYPE_QUESTION);
    expect(ids).toContain(MS_FAQ_IDS.COST);
    expect(ids).not.toContain(MS_TOPIC_IDS.QUALIFY);
  });

  it('builds expert handoff menu with India PRC and more towers', () => {
    const handoff = buildHandoffMenuResponse();
    expect(handoff.mode).toBe('list');
    if (handoff.mode !== 'list') return;
    const ids = handoff.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toContain(MS_HANDOFF_IDS.PRC_INDIA);
    expect(ids).toContain(MS_HANDOFF_IDS.PRC);
    expect(ids).toContain(MS_HANDOFF_IDS.TAX);
    expect(ids).toContain(MS_HANDOFF_IDS.FINANCE);
    expect(ids).toContain(MS_HANDOFF_IDS.MORE);
    expect(ids.length).toBeLessThanOrEqual(10);
  });

  it('maps handoff contacts from the approved directory', () => {
    expect(cannedAnswerForId(MS_HANDOFF_IDS.PRC)).toMatch(/Sabrina\.Custer@ey\.com/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.TECHNOLOGY)).toMatch(/milan\.sheth@in\.ey\.com/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.CYBER)).toMatch(/tapan\.shah@ey\.com/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.LEARNING)).toMatch(/Savvas\.Koufou@uk\.ey\.com/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.TAX)).toMatch(/slang1@uk\.ey\.com/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.FINANCE)).toMatch(/slang1@uk\.ey\.com/i);
    const hrms = cannedAnswerForId(MS_HANDOFF_IDS.HRMS) ?? '';
    expect(hrms).toMatch(/Savvas\.Koufou@uk\.ey\.com/i);
    expect(hrms).toMatch(/HRMS \/ Payroll[\s\S]*Contact TBD/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.DATA_AI)).toMatch(/Contact TBD/i);
    expect(resolveMenuSelection('Talk to an expert')).toBe(MS_BUTTON_IDS.HANDOFF);
    expect(offeringQueryForId(MS_FAQ_IDS.CLOUD_COST)).toMatch(/FinOps/i);
  });

  it('truncates long answers on sentence boundaries', () => {
    const long = `${'Sentence one. '.repeat(80)}Trailing words without end`;
    const out = truncateWhatsAppBody(long, 200);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith('words')).toBe(false);
  });
});
