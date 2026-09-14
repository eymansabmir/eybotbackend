import { describe, it, expect, vi } from 'vitest';
import { extractResumeSlots } from './resume-extract';
import { structureResume, fallbackStructuredResume } from './resume-pdf';
import { ASK_GROUPS, type ResumeState } from './resume-builder';
import type { MsAssistantChat } from '../infrastructure/llm/shared';

/** Minimal fake chat whose `complete` returns a scripted string (or throws). */
function fakeLlm(complete?: (p: { system: string; user: string }) => Promise<string>): MsAssistantChat {
  return {
    answer: vi.fn(),
    suggestNearMiss: vi.fn(),
    summarizeIfNeeded: vi.fn(),
    ...(complete ? { complete: vi.fn(complete) } : {}),
  } as unknown as MsAssistantChat;
}

const workStory = ASK_GROUPS.find((g) => g.id === 'work_story')!;
const eduGroup = ASK_GROUPS.find((g) => g.id === 'education')!;

describe('extractResumeSlots', () => {
  it('extracts only the concise answer, translated to English', async () => {
    const llm = fakeLlm(async () =>
      JSON.stringify({ trade: 'Mason', experience: '3 years', pastWork: 'Sharma Builder - 2 years' }),
    );
    const slots = await extractResumeSlots(llm, {
      rawText: 'मेरा अनुभव तीन साल का है, पहले शर्मा बिल्डर में दो साल काम किया',
      language: 'hi',
      focusFields: workStory.fields,
      askedAbout: workStory.ask,
    });
    expect(slots).toEqual({
      trade: 'Mason',
      experience: '3 years',
      pastWork: 'Sharma Builder - 2 years',
    });
  });

  it('ignores keys that are not resume slots (e.g. phone)', async () => {
    const llm = fakeLlm(async () => JSON.stringify({ fullName: 'Ramlal', phone: '99999', foo: 'bar' }));
    const slots = await extractResumeSlots(llm, {
      rawText: 'anything',
      language: 'hi',
      focusFields: ['fullName'],
    });
    expect(slots).toEqual({ fullName: 'Ramlal' });
    expect(slots).not.toHaveProperty('phone');
  });

  it('joins array values into a comma string', async () => {
    const llm = fakeLlm(async () => JSON.stringify({ skills: ['Pipe fitting', 'Leak repair'] }));
    const slots = await extractResumeSlots(llm, {
      rawText: 'x',
      language: 'hi',
      focusFields: ['skills'],
    });
    expect(slots.skills).toBe('Pipe fitting, Leak repair');
  });

  it('parses JSON even when wrapped in code fences', async () => {
    const llm = fakeLlm(async () => '```json\n{"education":"10th pass","certifications":"Driving licence"}\n```');
    const slots = await extractResumeSlots(llm, {
      rawText: '10th pass, driving licence',
      language: 'hi',
      focusFields: eduGroup.fields,
    });
    expect(slots).toEqual({ education: '10th pass', certifications: 'Driving licence' });
  });

  it('falls back to raw text in the primary field when no LLM is available', async () => {
    const llm = fakeLlm(); // no complete()
    const slots = await extractResumeSlots(llm, {
      rawText: 'raw hindi answer',
      language: 'hi',
      focusFields: workStory.fields,
    });
    expect(slots).toEqual({ experience: 'raw hindi answer' });
  });

  it('falls back to raw text when the LLM throws', async () => {
    const llm = fakeLlm(async () => {
      throw new Error('404 model_not_found');
    });
    const slots = await extractResumeSlots(llm, {
      rawText: 'raw hindi answer',
      language: 'hi',
      focusFields: ['skills'],
    });
    expect(slots).toEqual({ skills: 'raw hindi answer' });
  });

  it('returns empty when the message is blank', async () => {
    const llm = fakeLlm(async () => '{}');
    const slots = await extractResumeSlots(llm, {
      rawText: '   ',
      language: 'hi',
      focusFields: ['skills'],
    });
    expect(slots).toEqual({});
  });
});

describe('structureResume', () => {
  const rawState = {
    status: 'review',
    language: 'hi',
    professionId: 'plumber',
    askedGroups: [],
    answers: {
      fullName: 'मंसब',
      trade: 'Plumber',
      phone: '+918448728057',
      location: 'दिल्ली',
      experience: 'म 6 साल से काम कर रहा हूं',
      skills: 'म पाइप फिटिंग करता हूं',
    },
  } as unknown as ResumeState;

  it('returns the LLM-structured English resume', async () => {
    const englishResume = {
      fullName: 'Mansab',
      title: 'Experienced Plumber',
      phone: '+918448728057',
      location: 'Delhi',
      summary: 'Mansab is a skilled plumber with 6 years of experience in pipe fitting and repairs.',
      experienceYears: '6 years',
      skills: ['Pipe fitting', 'Leak repair'],
      workHistory: [],
      education: '10th Pass',
      languages: [],
      certifications: [],
    };
    const llm = fakeLlm(async () => JSON.stringify(englishResume));
    const r = await structureResume(llm, rawState);
    expect(r.fullName).toBe('Mansab');
    expect(r.location).toBe('Delhi');
    expect(r.experienceYears).toBe('6 years');
    expect(r.skills).toContain('Pipe fitting');
    // No Devanagari should survive in the structured output.
    expect(JSON.stringify(r)).not.toMatch(/[\u0900-\u097F]/);
  });

  it('guarantees a summary even if the model omits it', async () => {
    const llm = fakeLlm(async () =>
      JSON.stringify({ fullName: 'Mansab', skills: ['Pipe fitting'], workHistory: [] }),
    );
    const r = await structureResume(llm, rawState);
    expect(r.summary && r.summary.length).toBeTruthy();
  });

  it('falls back to a deterministic resume when the LLM throws', async () => {
    const llm = fakeLlm(async () => {
      throw new Error('404 model_not_found');
    });
    const r = await structureResume(llm, rawState);
    expect(r).toEqual(fallbackStructuredResume(rawState));
    expect(r.fullName).toBeTruthy();
  });

  it('falls back when there is no LLM at all', async () => {
    const llm = fakeLlm();
    const r = await structureResume(llm, rawState);
    expect(r.fullName).toBeTruthy();
  });
});
