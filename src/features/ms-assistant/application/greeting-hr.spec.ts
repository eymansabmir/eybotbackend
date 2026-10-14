import { describe, expect, it } from 'vitest';
import {
  HR_ACTION_CATALOG,
  HR_BUTTON_IDS,
  HR_POLICY_MENU,
  buildHrButtonRow,
  buildHrCatalogResponse,
  buildHrNearMissResponse,
  buildHrWelcomeResponse,
  collectHrButtonCandidates,
  enforceHrBotResponse,
  expandHrSearchQuery,
  filterHrRetrievedChunks,
  formatHrAnswerText,
  hrActionQuery,
  isHrCatalogQuery,
  isHrJourneyFollowUp,
  looksLikeHrMenuChoice,
  matchedHrPolicyIds,
  relevantHrActionIds,
  resolveHrMenuSelection,
  resolveHrRetrievalTopic,
} from './greeting-hr';

describe('HR greeting', () => {
  it('keeps catalog titles within WhatsApp button limits', () => {
    for (const action of HR_ACTION_CATALOG) {
      expect(action.title.length).toBeLessThanOrEqual(20);
      expect(action.id.startsWith('hr_')).toBe(true);
    }
    for (const row of HR_POLICY_MENU) {
      expect(row.title.length).toBeLessThanOrEqual(24);
      expect(row.description.length).toBeLessThanOrEqual(72);
    }
    expect(HR_POLICY_MENU).toHaveLength(10);
  });

  it('welcome menu lists only knowledge-base policies', () => {
    const welcome = buildHrWelcomeResponse();
    expect(welcome.mode).toBe('list');
    if (welcome.mode !== 'list') return;
    const ids = welcome.sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).toEqual(HR_POLICY_MENU.map((p) => p.id));
    expect(ids).toContain(HR_BUTTON_IDS.LEAVE);
    expect(ids).toContain(HR_BUTTON_IDS.STUDY_LEAVE);
    expect(ids).not.toContain(HR_BUTTON_IDS.MAIN_MENU);
  });

  it('leave questions do not offer unrelated policies like day care or IJP', () => {
    const q = 'How many earned leave days do I get?';
    const candidates = collectHrButtonCandidates(q);
    const allowed = relevantHrActionIds(q);
    expect(matchedHrPolicyIds(q)).toContain(HR_BUTTON_IDS.LEAVE);
    expect(candidates).not.toContain(HR_BUTTON_IDS.DAYCARE);
    expect(candidates).not.toContain(HR_BUTTON_IDS.IJP);
    expect(allowed.has(HR_BUTTON_IDS.DAYCARE)).toBe(false);
    expect(allowed.has(HR_BUTTON_IDS.MATERNITY)).toBe(true);
  });

  it('study leave does not pull unrelated parental options', () => {
    const q = 'Can I take extended study leave for CA Final?';
    const candidates = collectHrButtonCandidates(q);
    expect(candidates).toContain(HR_BUTTON_IDS.STUDY_LEAVE);
    expect(candidates).not.toContain(HR_BUTTON_IDS.MATERNITY);
    expect(candidates).not.toContain(HR_BUTTON_IDS.DAYCARE);
  });

  it('day care questions stay on childcare / parental journey', () => {
    const q = 'Am I eligible for day care reimbursement?';
    const candidates = collectHrButtonCandidates(q);
    expect(candidates).not.toContain(HR_BUTTON_IDS.STUDY_LEAVE);
    expect(candidates).not.toContain(HR_BUTTON_IDS.IJP);
    expect(candidates).toContain(HR_BUTTON_IDS.APPLY);
    expect(candidates).not.toContain(HR_BUTTON_IDS.ELIGIBILITY);
  });

  it('drops invented button ids and always keeps Main Menu', () => {
    const q = 'What is the IJP cooling period?';
    const enforced = enforceHrBotResponse(
      {
        mode: 'buttons',
        text: 'Cooling period applies after an internal move.',
        buttons: [
          { id: 'hr_invented_ticket', title: 'Raise ticket' },
          { id: HR_BUTTON_IDS.ELIGIBILITY, title: 'Am I eligible?' },
          { id: HR_BUTTON_IDS.APPLY, title: 'How to apply' },
        ],
      },
      q,
    );
    expect(enforced.mode).toBe('buttons');
    if (enforced.mode !== 'buttons') return;
    expect(enforced.buttons.every((b) => b.id === HR_BUTTON_IDS.MAIN_MENU || HR_ACTION_CATALOG.some((a) => a.id === b.id))).toBe(true);
    expect(enforced.buttons.some((b) => b.id === 'hr_invented_ticket')).toBe(false);
    expect(enforced.buttons.at(-1)?.id).toBe(HR_BUTTON_IDS.MAIN_MENU);
    expect(enforced.buttons.every((b) => b.title.length <= 20)).toBe(true);
  });

  it('always ends the button row with Main Menu', () => {
    const q = 'Tell me about maternity leave';
    const row = buildHrButtonRow(
      [HR_BUTTON_IDS.DOCUMENTS, HR_BUTTON_IDS.APPLY, HR_BUTTON_IDS.MAIN_MENU],
      q,
    );
    expect(row.at(-1)?.id).toBe(HR_BUTTON_IDS.MAIN_MENU);
    expect(row.filter((b) => b.id === HR_BUTTON_IDS.MAIN_MENU)).toHaveLength(1);
    expect(row.length).toBeGreaterThan(0);
    expect(row.length).toBeLessThanOrEqual(3);
  });

  it('does not offer medical support after a health-checkup answer unless knowledge mentions it', () => {
    const q = 'How do I book a health checkup on Tata 1MG?';
    const knowledge =
      'Health Assessment Policy\nTata 1MG booking process\nEligible on-roll employees add their work email and coupon code.';
    const enforced = enforceHrBotResponse(
      {
        mode: 'buttons',
        text: 'Add your work email in Tata 1MG and enter the employee coupon code.\n* Official work email must be verified.\nChoose a next step below.',
        buttons: [
          { id: HR_BUTTON_IDS.MEDICAL, title: 'Medical support' },
          { id: HR_BUTTON_IDS.HEALTH, title: 'Health checkup' },
        ],
      },
      q,
      undefined,
      knowledge,
    );
    expect(enforced.mode).toBe('buttons');
    if (enforced.mode !== 'buttons') return;
    expect(enforced.buttons.some((b) => b.id === HR_BUTTON_IDS.MEDICAL)).toBe(false);
    expect(enforced.buttons.some((b) => b.id === HR_BUTTON_IDS.HEALTH)).toBe(false);
    expect(enforced.buttons.at(-1)?.id).toBe(HR_BUTTON_IDS.MAIN_MENU);
    expect(enforced.text).toContain('\n\n* ');
    expect(enforced.text).toContain('\n\nChoose a next step below.');
  });

  it('maps policy taps to retrieval queries from the knowledge base', () => {
    expect(hrActionQuery(HR_BUTTON_IDS.IJP, undefined)).toMatch(/DiversifEY/i);
    expect(hrActionQuery(HR_BUTTON_IDS.ELIGIBILITY, HR_BUTTON_IDS.DAYCARE)).toMatch(
      /Day care policy/i,
    );
    expect(hrActionQuery(HR_BUTTON_IDS.ELIGIBILITY, HR_BUTTON_IDS.BENEVOLENCE)).toMatch(
      /Benevolence policy/i,
    );
    expect(looksLikeHrMenuChoice('hr_leave')).toBe(true);
    expect(looksLikeHrMenuChoice('how many leave days')).toBe(false);
    expect(resolveHrMenuSelection('Internal jobs')).toBe(HR_BUTTON_IDS.IJP);
    expect(resolveHrMenuSelection('hr_benevolence')).toBe(HR_BUTTON_IDS.BENEVOLENCE);
  });

  it('near miss shows soft message with Main Menu only, not the welcome greeting', () => {
    const miss = buildHrNearMissResponse('Benevolence policy: eligibility', HR_BUTTON_IDS.BENEVOLENCE);
    expect(miss.mode).toBe('buttons');
    if (miss.mode !== 'buttons') return;
    expect(miss.text).not.toMatch(/Welcome/i);
    expect(miss.buttons).toEqual([{ id: HR_BUTTON_IDS.MAIN_MENU, title: 'Main Menu' }]);
  });

  it('detects catalog queries and does not scope retrieval to a stale topic', () => {
    expect(isHrCatalogQuery('Can you list all policies')).toBe(true);
    expect(isHrCatalogQuery('what policies do you have')).toBe(true);
    expect(isHrCatalogQuery('how many EL days do I get')).toBe(false);

    const topic = resolveHrRetrievalTopic(
      'Can you list all policies',
      {},
      HR_BUTTON_IDS.BENEVOLENCE,
    );
    expect(topic).toBeUndefined();
  });

  it('scopes journey follow-ups to stored topic but not catalog questions', () => {
    expect(
      resolveHrRetrievalTopic('how do I apply?', {}, HR_BUTTON_IDS.BENEVOLENCE),
    ).toBe(HR_BUTTON_IDS.BENEVOLENCE);
    expect(isHrJourneyFollowUp('how do I apply?')).toBe(true);
    expect(isHrJourneyFollowUp('Can you list all policies')).toBe(false);
  });

  it('boosts README chunks for catalog-style search queries', () => {
    const chunks = filterHrRetrievedChunks(
      [
        { text: 'Benevolence Policy eligibility committee', source: '01_benevolence.md', score: 0.4 },
        {
          text: 'Policies in this folder leave compensation day care',
          source: '00_README.md',
          score: 0.28,
        },
      ],
      0.32,
      undefined,
      'Can you list all policies',
    );
    expect(chunks[0]?.source).toBe('00_README.md');
  });

  it('returns policy list for catalog responses', () => {
    const catalog = buildHrCatalogResponse();
    expect(catalog.mode).toBe('list');
    if (catalog.mode !== 'list') return;
    expect(catalog.text).toMatch(/People policies I can help with/i);
    expect(catalog.sections[0]?.rows).toHaveLength(10);
  });

  it('adds blank lines between the answer, bullets, and next-step line', () => {
    const formatted = formatHrAnswerText(
      'Add your work email in Tata 1MG.\n* Official work email must be verified.\nChoose a next step below.',
    );
    expect(formatted).toBe(
      'Add your work email in Tata 1MG.\n\n* Official work email must be verified.\n\nChoose a next step below.',
    );
  });
});
