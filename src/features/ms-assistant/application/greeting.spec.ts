import { describe, expect, it } from 'vitest';
import {
  isGreetingText,
  buildWelcomeResponse,
  buildOfferingsResponse,
  buildFaqMenuResponse,
  buildHandoffMenuResponse,
  buildHandoffLeadershipResponse,
  buildHandoffCoreResponse,
  offeringQueryForId,
  cannedAnswerForId,
  resolveMenuSelection,
  truncateWhatsAppBody,
  MS_BUTTON_IDS,
  MS_TOPIC_IDS,
  MS_FAQ_IDS,
  MS_HANDOFF_IDS,
  HANDOFF_CONTACTS,
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

  it('builds expert handoff menu with Leadership and Core Team', () => {
    const handoff = buildHandoffMenuResponse();
    expect(handoff.mode).toBe('buttons');
    if (handoff.mode !== 'buttons') return;
    expect(handoff.buttons.map((b) => b.id)).toEqual([
      MS_HANDOFF_IDS.LEADERSHIP,
      MS_HANDOFF_IDS.CORE,
      MS_BUTTON_IDS.MAIN_MENU,
    ]);

    const leadership = buildHandoffLeadershipResponse();
    expect(leadership.mode).toBe('list');
    if (leadership.mode !== 'list') return;
    const ldIds = leadership.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ldIds).toContain(MS_HANDOFF_IDS.LD_CYBER);
    expect(ldIds).toHaveLength(9);

    const core = buildHandoffCoreResponse();
    expect(core.mode).toBe('list');
    if (core.mode !== 'list') return;
    const ctIds = core.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ctIds).toContain(MS_HANDOFF_IDS.CT_AMS);
    expect(ctIds).toHaveLength(10);
    expect(ctIds.length).toBeLessThanOrEqual(10);
  });

  it('maps handoff contacts from the approved directory', () => {
    expect(HANDOFF_CONTACTS).toHaveLength(19);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.LD_CYBER)).toMatch(/Murali Rao/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.LD_TECHNOLOGY)).toMatch(/Selva R\./i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.CT_AMS)).toMatch(/Shanthi Mani/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.CT_TFO)).toMatch(/Jitesh Bansal/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.CT_MLS)).toMatch(/Ashish Jain/i);
    expect(cannedAnswerForId(MS_HANDOFF_IDS.LD_CYBER)).not.toMatch(/@ey\.com/i);
    expect(resolveMenuSelection('Talk to an expert')).toBe(MS_BUTTON_IDS.HANDOFF);
    expect(resolveMenuSelection('Leadership Team')).toBe(MS_HANDOFF_IDS.LEADERSHIP);
    expect(resolveMenuSelection('Core Team')).toBe(MS_HANDOFF_IDS.CORE);
    expect(offeringQueryForId(MS_FAQ_IDS.CLOUD_COST)).toMatch(/FinOps/i);
  });

  it('truncates long answers on sentence boundaries', () => {
    const long = `${'Sentence one. '.repeat(80)}Trailing words without end`;
    const out = truncateWhatsAppBody(long, 200);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith('words')).toBe(false);
  });
});
