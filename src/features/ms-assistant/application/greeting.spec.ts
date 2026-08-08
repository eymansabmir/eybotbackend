import { describe, expect, it } from 'vitest';
import {
  isGreetingText,
  buildWelcomeResponse,
  buildOfferingsResponse,
  buildFaqMenuResponse,
  buildHandoffMenuResponse,
  buildAskPromptResponse,
  offeringQueryForId,
  cannedAnswerForId,
  resolveMenuSelection,
  resolveHandoffPillarId,
  truncateWhatsAppBody,
  buildNearMissAllowList,
  MS_BUTTON_IDS,
  MS_TOPIC_IDS,
  MS_FAQ_IDS,
  MS_HANDOFF_IDS,
  HANDOFF_CONTACTS,
  HANDOFF_PILLARS,
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
      MS_BUTTON_IDS.TYPE_QUESTION,
      MS_BUTTON_IDS.SURVEY,
      MS_BUTTON_IDS.SERVICES,
      MS_BUTTON_IDS.OFFERINGS,
      MS_BUTTON_IDS.HANDOFF,
      MS_BUTTON_IDS.ASK,
    ]);
    expect(welcome.sections[0]?.rows.find((r) => r.id === MS_BUTTON_IDS.TYPE_QUESTION)?.title).toBe(
      'Ask anything',
    );
    expect(welcome.sections[0]?.rows.find((r) => r.id === MS_BUTTON_IDS.ASK)?.title).toBe(
      'Run a Client diagnostic',
    );
    expect(welcome.sections[0]?.rows.find((r) => r.id === MS_BUTTON_IDS.HANDOFF)?.title).toBe(
      'Talk to an expert',
    );
    const survey = welcome.sections[0]?.rows.find((r) => r.id === MS_BUTTON_IDS.SURVEY);
    expect(survey?.title).toBe('Client Opportunity Scan');
    expect(survey?.description).toBe('Fill details to get an actionable report over email');
  });

  it('returns survey link for Client Opportunity Scan', () => {
    const answer = cannedAnswerForId(MS_BUTTON_IDS.SURVEY) ?? '';
    expect(answer).toMatch(/Please click on below link to start the survey/i);
    expect(answer).toContain('https://globaleysurvey.ey.com/jfe/form/SV_1Cjy5whgPyBoH7U');
    expect(resolveMenuSelection('Client Opportunity Scan')).toBe(MS_BUTTON_IDS.SURVEY);
    expect(resolveMenuSelection('Take the survey')).toBe(MS_BUTTON_IDS.SURVEY);
  });

  it('builds Ask anything prompt for open-ended KB Q&A', () => {
    const ask = buildAskPromptResponse();
    expect(ask.mode).toBe('buttons');
    if (ask.mode !== 'buttons') return;
    expect(ask.text).toMatch(/Ask anything/i);
    expect(ask.text).toMatch(/approved/i);
    expect(ask.buttons.some((b) => b.id === MS_BUTTON_IDS.MAIN_MENU)).toBe(true);
    expect(resolveMenuSelection('Ask anything')).toBe(MS_BUTTON_IDS.TYPE_QUESTION);
    expect(resolveMenuSelection('Type my question')).toBe(MS_BUTTON_IDS.TYPE_QUESTION);
    expect(resolveMenuSelection('Ask a question')).toBe(MS_BUTTON_IDS.TYPE_QUESTION);
    expect(resolveMenuSelection('Run a Client diagnostic')).toBe(MS_BUTTON_IDS.ASK);
    expect(resolveMenuSelection('Guide & Ask')).toBe(MS_BUTTON_IDS.ASK);
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

  it('dedupes Client diagnostic away from qualification duplicates', () => {
    const faqs = buildFaqMenuResponse();
    expect(faqs.mode).toBe('list');
    if (faqs.mode !== 'list') return;
    expect(faqs.text).toMatch(/Client diagnostic/i);
    const ids = faqs.sections[0]?.rows.map((r) => r.id) ?? [];
    expect(ids).toContain(MS_BUTTON_IDS.TYPE_QUESTION);
    expect(ids).toContain(MS_FAQ_IDS.COST);
    expect(ids).not.toContain(MS_TOPIC_IDS.QUALIFY);
  });

  it('builds expert handoff menu by KB offering domains', () => {
    const handoff = buildHandoffMenuResponse();
    expect(handoff.mode).toBe('list');
    if (handoff.mode !== 'list') return;
    const ids = handoff.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toEqual([
      ...HANDOFF_PILLARS.map((p) => p.id),
      MS_BUTTON_IDS.MAIN_MENU,
    ]);
    expect(ids.length).toBeLessThanOrEqual(10);
    expect(ids).toContain(MS_HANDOFF_IDS.P_CYBER);
    expect(ids).toContain(MS_HANDOFF_IDS.P_DATA_AI);
    expect(ids).toContain(MS_HANDOFF_IDS.P_GTM);
    expect(ids).not.toContain('ms_handoff_leadership');
  });

  it('maps handoff contacts under content-backed pillars', () => {
    expect(HANDOFF_CONTACTS).toHaveLength(22);
    expect(HANDOFF_PILLARS).toHaveLength(9);

    const cyber = cannedAnswerForId(MS_HANDOFF_IDS.P_CYBER) ?? '';
    expect(cyber).toMatch(/SOC and Cyber/i);
    expect(cyber).toMatch(/Murali\.Rao@in\.ey\.com/i);
    expect(cyber).toMatch(/Raghavendra\.Bv@in\.ey\.com/i);

    const dataAi = cannedAnswerForId(MS_HANDOFF_IDS.P_DATA_AI) ?? '';
    expect(dataAi).toMatch(/Alexy\.Thomas@in\.ey\.com/i);
    expect(dataAi).toMatch(/Sivakumar\.Moorty@in\.ey\.com/i);
    expect(dataAi).toMatch(/bvijay\.shankar@in\.ey\.com/i);
    expect(dataAi).toMatch(/Hari\.Balaji@in\.ey\.com/i);
    expect(dataAi).toMatch(/Salil\.Shekharan@in\.ey\.com/i);

    const tax = cannedAnswerForId(MS_HANDOFF_IDS.P_TAX_FINANCE) ?? '';
    expect(tax).toMatch(/jitesh\.bansal@in\.ey\.com/i);
    expect(tax).toMatch(/garima\.pande@in\.ey\.com/i);
    expect(tax).toMatch(/rahul\.patni@ey\.com/i);
    expect(tax).not.toMatch(/Nitish\.Jain@in\.ey\.com/i);
    expect(tax).not.toMatch(/swati\.umre@in\.ey\.com/i);

    expect(resolveHandoffPillarId('cyber')).toBe(MS_HANDOFF_IDS.P_CYBER);
    expect(resolveHandoffPillarId('sap')).toBe(MS_HANDOFF_IDS.P_TECH);
    expect(resolveHandoffPillarId('llm governance')).toBe(MS_HANDOFF_IDS.P_DATA_AI);
    expect(resolveMenuSelection('Talk to an expert')).toBe(MS_BUTTON_IDS.HANDOFF);
    expect(resolveMenuSelection('Data and AI')).toBe(MS_HANDOFF_IDS.P_DATA_AI);
    expect(offeringQueryForId(MS_FAQ_IDS.CLOUD_COST)).toMatch(/FinOps/i);

    const allow = buildNearMissAllowList();
    expect(allow.topics.some((t) => /SAP AMS/i.test(t.label))).toBe(true);
    expect(allow.owners.some((o) => o.name === 'Shanthi Mani')).toBe(true);
    expect(allow.owners.some((o) => /swati/i.test(o.name))).toBe(false);
  });

  it('truncates long answers on sentence boundaries', () => {
    const long = `${'Sentence one. '.repeat(80)}Trailing words without end`;
    const out = truncateWhatsAppBody(long, 200);
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith('words')).toBe(false);
  });
});
