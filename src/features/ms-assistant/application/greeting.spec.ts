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

  it('builds welcome list including Talk to a human', () => {
    const welcome = buildWelcomeResponse();
    expect(welcome.mode).toBe('list');
    if (welcome.mode !== 'list') return;
    const ids = welcome.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toEqual([
      MS_BUTTON_IDS.SERVICES,
      MS_BUTTON_IDS.OFFERINGS,
      MS_BUTTON_IDS.ASK,
      MS_BUTTON_IDS.HANDOFF,
    ]);
  });

  it('builds trigger and guide lists from playbook', () => {
    const topics = buildOfferingsResponse();
    expect(topics.mode).toBe('list');
    if (topics.mode !== 'list') return;
    const ids = topics.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toContain(MS_TOPIC_IDS.CAPACITY);
    expect(ids).toContain(MS_TOPIC_IDS.WHEN_NOT);

    const faqs = buildFaqMenuResponse();
    expect(faqs.mode).toBe('list');
    if (faqs.mode !== 'list') return;
    expect(faqs.sections[0]?.rows.some((r) => r.id === MS_FAQ_IDS.THREE_TESTS)).toBe(true);
    expect(faqs.sections[0]?.rows.some((r) => r.id === MS_BUTTON_IDS.HANDOFF)).toBe(true);
  });

  it('builds handoff menu with PRC and tower categories', () => {
    const handoff = buildHandoffMenuResponse();
    expect(handoff.mode).toBe('list');
    if (handoff.mode !== 'list') return;
    const ids = handoff.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toContain(MS_HANDOFF_IDS.PRC);
    expect(ids).toContain(MS_HANDOFF_IDS.TECHNOLOGY);
    expect(ids).toContain(MS_HANDOFF_IDS.CYBER);
  });

  it('maps topic ids to canned playbook answers', () => {
    expect(cannedAnswerForId(MS_TOPIC_IDS.QUALIFY)).toMatch(/Run \/ Operate Scope/i);
    expect(offeringQueryForId(MS_FAQ_IDS.CLOUD_COST)).toMatch(/FinOps/i);
  });

  it('maps handoff ids to canned contacts without inventing TBD emails', () => {
    expect(cannedAnswerForId(MS_HANDOFF_IDS.PRC)).toMatch(/Sabrina\.Custer@ey\.com/i);
    const tech = cannedAnswerForId(MS_HANDOFF_IDS.TECHNOLOGY) ?? '';
    expect(tech).toMatch(/Contact TBD/i);
    // TBD towers may point to Sabrina for routing, but must not invent a tower-specific email.
    expect(tech).not.toMatch(/Technology.*@ey\.com/i);
    expect(tech.match(/@ey\.com/g)?.length ?? 0).toBe(1);
    expect(resolveMenuSelection('Talk to a human')).toBe(MS_BUTTON_IDS.HANDOFF);
    expect(resolveMenuSelection('PRC / Pursuit')).toBe(MS_HANDOFF_IDS.PRC);
  });
});
