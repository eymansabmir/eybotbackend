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

  it('formats the outbound text message', () => {
    const msg = formatFlowScoreMessage({
      optionCount: 5,
      scoredOptionCount: 5,
      unmatched: [],
      score: 17,
      maxScore: 75,
      percentage: 23,
    });
    expect(msg).toContain('23%');
    expect(msg).toContain('17/75');
  });
});
