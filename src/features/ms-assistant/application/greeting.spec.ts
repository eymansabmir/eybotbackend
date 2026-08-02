import {
  isGreetingText,
  buildWelcomeResponse,
  buildOfferingsResponse,
  buildFaqMenuResponse,
  offeringQueryForId,
  cannedAnswerForId,
  MS_BUTTON_IDS,
  MS_TOPIC_IDS,
  MS_FAQ_IDS,
} from './greeting';

describe('ms-assistant greeting', () => {
  it('detects common greetings and menu keywords', () => {
    expect(isGreetingText('Hi')).toBe(true);
    expect(isGreetingText('menu')).toBe(true);
    expect(isGreetingText('What is SAP?')).toBe(false);
  });

  it('builds playbook welcome buttons', () => {
    const welcome = buildWelcomeResponse();
    expect(welcome.mode).toBe('buttons');
    if (welcome.mode !== 'buttons') return;
    expect(welcome.buttons.map((b) => b.id)).toEqual([
      MS_BUTTON_IDS.SERVICES,
      MS_BUTTON_IDS.OFFERINGS,
      MS_BUTTON_IDS.ASK,
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
  });

  it('maps topic ids to canned playbook answers', () => {
    expect(cannedAnswerForId(MS_TOPIC_IDS.QUALIFY)).toMatch(/Run \/ Operate Scope/i);
    expect(offeringQueryForId(MS_FAQ_IDS.CLOUD_COST)).toMatch(/FinOps/i);
  });
});
