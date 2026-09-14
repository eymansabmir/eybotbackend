import { describe, it, expect } from 'vitest';
import {
  ASK_GROUPS,
  EMPTY_RESUME_STATE,
  PROFESSIONS,
  RESUME_BUTTON_IDS,
  RESUME_PROFESSION_PREFIX,
  beginProfessionChoice,
  buildProfessionList,
  buildResumeQuestion,
  buildResumeReview,
  buildResumeWelcome,
  currentResumeGroup,
  detectLanguageSwitch,
  generateReferenceId,
  hasMinimumForResume,
  isResumeGenerateText,
  isResumeRestart,
  isResumeSkip,
  planNextGroup,
  professionFromRowId,
  recordAnswer,
  startInterview,
  switchLanguage,
  type ResumeState,
} from './resume-builder';

const driver = PROFESSIONS.find((p) => p.id === 'driver')!;
const other = PROFESSIONS.find((p) => p.id === 'other')!;

describe('resume-builder (agentic slot flow)', () => {
  it('welcome offers a language + start choice', () => {
    const res = buildResumeWelcome();
    expect(res.mode).toBe('buttons');
    if (res.mode === 'buttons') {
      const ids = res.buttons.map((b) => b.id);
      expect(ids).toContain(RESUME_BUTTON_IDS.START_HI);
      expect(ids).toContain(RESUME_BUTTON_IDS.START_EN);
    }
  });

  it('language choice leads to an interactive profession list', () => {
    const { state, response } = beginProfessionChoice('hi');
    expect(state.status).toBe('choosing_profession');
    expect(response.mode).toBe('list');
    if (response.mode === 'list') {
      const rowIds = response.sections.flatMap((s) => s.rows.map((r) => r.id));
      expect(rowIds).toContain(`${RESUME_PROFESSION_PREFIX}driver`);
      expect(rowIds).toContain(`${RESUME_PROFESSION_PREFIX}other`);
    }
  });

  it('profession list rows resolve back to a profession', () => {
    expect(professionFromRowId(`${RESUME_PROFESSION_PREFIX}driver`)?.id).toBe('driver');
    expect(professionFromRowId('nope')).toBeUndefined();
  });

  it('list button title + row titles stay within WhatsApp limits', () => {
    const res = buildProfessionList('hi');
    if (res.mode === 'list') {
      expect(res.buttonTitle!.length).toBeLessThanOrEqual(20);
      for (const s of res.sections) {
        expect(s.title.length).toBeLessThanOrEqual(24);
        for (const r of s.rows) {
          expect(r.title.length).toBeLessThanOrEqual(24);
          expect((r.description ?? '').length).toBeLessThanOrEqual(72);
        }
      }
    }
  });

  it('never asks for phone; max 6 ask-groups', () => {
    expect(ASK_GROUPS.length).toBeLessThanOrEqual(6);
    expect(ASK_GROUPS.flatMap((g) => g.fields)).not.toContain('phone');
  });

  it('known profession presets trade + phone and asks work_story first (skips work_kind)', () => {
    const { state, response } = startInterview('hi', driver, '+918448728057');
    expect(state.status).toBe('collecting');
    expect(state.answers.trade).toBe('Driver');
    expect(state.answers.phone).toBe('+918448728057');
    expect(state.currentGroupId).toBe('work_story'); // work_kind skipped, trade known
    expect(response.mode).toBe('text');
  });

  it('"Other" profession asks work_kind first', () => {
    const { state } = startInterview('hi', other);
    expect(state.professionId).toBe('other');
    expect(state.currentGroupId).toBe('work_kind');
    expect(state.answers.trade).toBeUndefined();
  });

  it('a rich message fills many slots and skips those questions', () => {
    const start = startInterview('hi', driver); // currentGroup = work_story
    const r = recordAnswer(start.state, {
      experience: '8 years',
      pastWork: 'Sharma Builder - 4 years',
      skills: 'Driving, route knowledge',
      fullName: 'Ramlal',
      location: 'Delhi',
    });
    // work_story answered; skills + contact filled -> next unmet is optional education
    expect(r.state.currentGroupId).toBe('education');
    expect(r.state.answers.fullName).toBe('Ramlal');
  });

  it('asks skills when only experience was given', () => {
    const start = startInterview('hi', driver);
    const r = recordAnswer(start.state, { experience: '3 years' });
    expect(r.state.currentGroupId).toBe('skills');
  });

  it('uses first name in the acknowledgement on later questions', () => {
    const start = startInterview('hi', driver);
    const r = recordAnswer(start.state, { experience: '3 years', fullName: 'Ramlal' });
    expect(r.response.text).toContain('Ramlal');
  });

  it('optional groups render a Skip button', () => {
    const state: ResumeState = {
      status: 'collecting',
      language: 'hi',
      professionId: 'driver',
      answers: { trade: 'Driver' },
      askedGroups: ['education'],
      currentGroupId: 'education',
    };
    const res = buildResumeQuestion(state);
    expect(res.mode).toBe('buttons');
    if (res.mode === 'buttons') expect(res.buttons[0]?.id).toBe(RESUME_BUTTON_IDS.SKIP);
  });

  it('reaches review once every group is asked/satisfied', () => {
    let state: ResumeState = startInterview('hi', driver).state;
    let reviewed = false;
    for (let i = 0; i < 10 && !reviewed; i++) {
      const group = currentResumeGroup(state)!;
      const filled = Object.fromEntries(group.fields.map((f) => [f, 'val']));
      const r = recordAnswer(state, filled);
      state = r.state;
      if (r.kind === 'review') {
        reviewed = true;
        if (r.response.mode === 'buttons') {
          const ids = r.response.buttons.map((b) => b.id);
          expect(ids).toContain(RESUME_BUTTON_IDS.GENERATE);
          expect(ids).toContain(RESUME_BUTTON_IDS.RESTART);
        }
      }
    }
    expect(reviewed).toBe(true);
    expect(state.status).toBe('review');
  });

  it('never re-asks the same group', () => {
    let state: ResumeState = startInterview('hi', driver).state;
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const gid = state.currentGroupId;
      if (!gid) break;
      expect(seen.has(gid)).toBe(false);
      seen.add(gid);
      state = recordAnswer(state, {}, { skip: true }).state;
    }
  });

  it('planNextGroup skips groups whose slots are already known', () => {
    const state: ResumeState = {
      status: 'collecting',
      language: 'hi',
      professionId: 'driver',
      answers: { trade: 'Driver', experience: '5 years', skills: 'Driving' },
      askedGroups: [],
    };
    // trade/experience/skills known -> first unmet group in order is education
    expect(planNextGroup(state)?.id).toBe('education');
  });

  it('review summary includes collected values', () => {
    const state: ResumeState = {
      status: 'review',
      language: 'hi',
      professionId: 'cook',
      answers: { fullName: 'Sita Devi', trade: 'Cook' },
      askedGroups: [],
    };
    const res = buildResumeReview(state);
    expect(res.text).toContain('Sita Devi');
    expect(res.text).toContain('Cook');
  });

  it('switchLanguage re-renders without advancing', () => {
    const start = startInterview('hi', driver);
    const switched = switchLanguage(start.state, 'en');
    expect(switched.state.language).toBe('en');
    expect(switched.state.currentGroupId).toBe('work_story');
    expect(switched.response.text).toContain('Question');
  });

  it('intent + language detectors', () => {
    expect(isResumeSkip('छोड़ें')).toBe(true);
    expect(isResumeSkip('none')).toBe(true);
    expect(isResumeSkip('रमेश')).toBe(false);
    expect(isResumeRestart('फिर से')).toBe(true);
    expect(isResumeGenerateText('रिज़्यूमे बनाओ')).toBe(true);
    expect(detectLanguageSwitch('English')).toBe('en');
    expect(detectLanguageSwitch('हिंदी')).toBe('hi');
    expect(detectLanguageSwitch('रमेश')).toBeNull();
  });

  it('hasMinimumForResume requires name or trade', () => {
    expect(hasMinimumForResume(EMPTY_RESUME_STATE)).toBe(false);
    expect(
      hasMinimumForResume({ ...EMPTY_RESUME_STATE, answers: { trade: 'Driver' } }),
    ).toBe(true);
  });

  it('reference id shape', () => {
    expect(generateReferenceId(new Date('2026-09-13T00:00:00Z'))).toMatch(/^RES-\d{8}-\d{4}$/);
  });
});
