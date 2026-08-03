import { describe, expect, it } from 'vitest';
import { formatFlowScoreMessage, scoreFlowAnswers } from './flow-score';

describe('scoreFlowAnswers (Partners Connect matrix)', () => {
  it('scores the sample Interakt payload against official points', () => {
    // From production webhook example
    const result = scoreFlowAnswers([
      { questionKey: 'Choose all that apply:', questionLabel: 'Choose all that apply:', valueText: 'AI Adoption' },
      { questionKey: 'Choose all that apply:_(2)', questionLabel: 'Choose all that apply:', valueText: 'Operations' },
      { questionKey: 'operations_to_take_over', questionLabel: 'Operations To Take Over', valueText: 'Finance' },
      { questionKey: 'Choose one:_(2)', questionLabel: 'Choose one:', valueText: 'No' },
      { questionKey: 'Choose one:', questionLabel: 'Choose one:', valueText: 'EY not recognized for Ops' },
    ]);

    // AI Adoption 5 + Operations 5 + Finance 5 + No 1 + EY not recognized 1 = 17 → 23%
    expect(result.score).toBe(17);
    expect(result.maxScore).toBe(75);
    expect(result.percentage).toBe(23);
    expect(result.scoredOptionCount).toBe(5);
    expect(result.unmatched).toEqual([]);
  });

  it('awards max 75 when every top option is selected', () => {
    const result = scoreFlowAnswers([
      { questionKey: 'Choose all that apply:', valueText: 'Cost Pressure' },
      { questionKey: 'Choose all that apply:', valueText: 'AI Adoption' },
      { questionKey: 'Choose all that apply:', valueText: 'Talent shortage' },
      { questionKey: 'Choose all that apply:', valueText: 'Security & Operations' },
      { questionKey: 'Choose all that apply:', valueText: 'Regulation & Compliance' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Advisory' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Operations' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Transformation' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Strategy' },
      { questionKey: 'operations_to_take_over', valueText: 'IT Operations' },
      { questionKey: 'operations_to_take_over', valueText: 'Cyber' },
      { questionKey: 'operations_to_take_over', valueText: 'Finance' },
      { questionKey: 'operations_to_take_over', valueText: 'Data & AI' },
      { questionKey: 'operations_to_take_over', valueText: 'Business Operations' },
      { questionKey: 'operations_to_take_over', valueText: 'HR and Learning' },
      { questionKey: 'Choose one:_(2)', valueText: 'Yes' },
      { questionKey: 'Choose one:', valueText: 'Open to our offering' },
    ]);

    expect(result.score).toBe(75);
    expect(result.percentage).toBe(100);
  });

  it('scores ey_partners_connect_form_final where Choose-all keys are swapped', () => {
    // Production webhook 2026-08-03: bare Choose-all = take-over options, _(2) = CXO options.
    const result = scoreFlowAnswers([
      { questionKey: 'Choose all that apply:', valueText: 'IT Operations' },
      { questionKey: 'Choose all that apply:', valueText: 'Cyber' },
      { questionKey: 'Choose all that apply:', valueText: 'Finance' },
      { questionKey: 'Choose all that apply:', valueText: 'Data & AI' },
      { questionKey: 'Choose all that apply:', valueText: 'Business Operations' },
      { questionKey: 'Choose all that apply:', valueText: 'HR and Learning' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Cost Pressure' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'AI Adoption' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Talent shortage' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Security & Operations' },
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Regulation & Compliance' },
      { questionKey: 'Choose one:_(2)', valueText: 'Yes' },
      { questionKey: 'Choose one:', valueText: 'Open to our offering' },
    ]);

    // Q3: 4+5+5+4+3+4=25, Q1: 5*5=25, Q4:5, Q5:5 → 60 (Q2 engagement absent)
    expect(result.score).toBe(60);
    expect(result.percentage).toBe(80);
    expect(result.scoredOptionCount).toBe(13);
    expect(result.unmatched).toEqual([]);
  });

  it('does not score Security & Operations as engagement Operations', () => {
    const result = scoreFlowAnswers([
      { questionKey: 'Choose all that apply:_(2)', valueText: 'Security & Operations' },
    ]);
    expect(result.score).toBe(5);
    expect(result.unmatched).toEqual([]);
  });

  it('formats the outbound text message', () => {
    const msg = formatFlowScoreMessage({
      optionCount: 5,
      scoredOptionCount: 5,
      unmatched: [],
      score: 17,
      maxScore: 75,
      percentage: 23,
    });
    expect(msg).toBe(
      'The Managed Services Opportunity Score is 23%. ' +
        'The MS self-assessment and personalized roadmap for you and your CXO is available at https://www.ey.com/en_in .',
    );
  });
});
