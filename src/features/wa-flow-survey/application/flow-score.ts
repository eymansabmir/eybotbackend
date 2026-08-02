/** Partners Connect flow — max score across all questions. */
export const FLOW_MAX_SCORE = 75;

export interface FlowScoreResult {
  optionCount: number;
  scoredOptionCount: number;
  unmatched: string[];
  score: number;
  maxScore: number;
  /** Integer percentage: round(score / 75 * 100) */
  percentage: number;
}

type ScoredOption = {
  points: number;
  /** Normalized aliases that match webhook valueText / raw option ids */
  aliases: string[];
};

type ScoredQuestion = {
  id: string;
  /** Match questionKey / questionLabel (normalized contains) */
  questionMatchers: string[];
  options: ScoredOption[];
};

/**
 * Official Partners Connect scoring matrix.
 * Question caps: Q1=25, Q2=15, Q3=25, Q4=5, Q5=5 → total 75.
 */
const PARTNERS_CONNECT_SCORECARD: ScoredQuestion[] = [
  {
    id: 'q1_cxo',
    questionMatchers: [
      'what keeps your clients cxo awake at night',
      'what keeps the clients cxo awake at night',
      'cxo awake',
      'choose all that apply',
    ], // Flow Q1
    // Prefer more specific matchers for "choose all that apply" via question order —
    // see resolveQuestion(). First multi "Choose all that apply:" without _(2) is Q1.
    options: [
      { points: 5, aliases: ['cost pressure'] },
      { points: 5, aliases: ['ai adoption'] },
      { points: 5, aliases: ['talent shortage'] },
      { points: 5, aliases: ['security operations', 'security and operations', 'security & operations'] },
      { points: 5, aliases: ['regulation compliance', 'regulation and compliance', 'regulation & compliance'] },
    ],
  },
  {
    id: 'q2_engagement',
    questionMatchers: [
      'what is your current engagement with client',
      'what is our current engagement with the client',
      'current ey engagement mix',
      'engagement mix',
      'choose all that apply 2',
      'choose all that apply_(2)',
    ], // Flow Q2
    options: [
      { points: 3, aliases: ['advisory'] },
      { points: 5, aliases: ['operations'] },
      { points: 4, aliases: ['transformation'] },
      { points: 3, aliases: ['strategy'] },
    ],
  },
  {
    id: 'q3_takeover',
    questionMatchers: [
      'if we could take over operations of the client what would it be',
      'if we could take over operations of the client',
      'if ey could take over an area of operations',
      'operations to take over',
      'operations_to_take_over',
      'take over an area',
    ], // Flow Q3
    options: [
      { points: 4, aliases: ['it operations'] },
      { points: 5, aliases: ['cyber'] },
      { points: 5, aliases: ['finance'] },
      { points: 4, aliases: ['data ai', 'data and ai', 'data & ai'] },
      { points: 3, aliases: ['business operations'] },
      { points: 4, aliases: ['hr and learning', 'hr learning', 'hr & learning'] },
    ],
  },
  {
    id: 'q4_outsource',
    questionMatchers: [
      'does the client already outsource operations',
      'current outsourcing status',
      'outsourcing',
      'choose one 2',
      'choose one_(2)',
    ], // Flow Q4
    options: [
      { points: 5, aliases: ['yes'] },
      { points: 1, aliases: ['no'] },
      { points: 4, aliases: ['partially'] },
    ],
  },
  {
    id: 'q5_disposition',
    questionMatchers: [
      'what is the clients disposition to ey as an operations partner',
      'client disposition towards ey operations',
      'disposition',
      'choose one',
    ], // Flow Q5
    options: [
      { points: 5, aliases: ['open to our offering'] },
      { points: 1, aliases: ['ey not recognized for ops'] },
      { points: 4, aliases: ['prefers sis'] },
      { points: 2, aliases: ['prefers incumbents'] },
    ],
  },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/_/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveQuestion(
  questionKey: string,
  questionLabel: string,
): ScoredQuestion | undefined {
  const keyNorm = normalize(questionKey);
  const labelNorm = normalize(questionLabel);
  const haystack = `${keyNorm} ${labelNorm}`;

  // Prefer specific keys first (avoid "choose all that apply" matching both Q1 and Q2).
  if (
    keyNorm.includes('operations to take over') ||
    keyNorm.includes('operations_to_take_over') ||
    labelNorm.includes('operations to take over') ||
    labelNorm.includes('take over')
  ) {
    return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q3_takeover');
  }

  // "Choose all that apply:_(2)" / Choose_all_that_apply with index → Q2
  if (
    /choose all that apply.*\b2\b/.test(keyNorm) ||
    /choose all that apply.*\b2\b/.test(labelNorm) ||
    keyNorm.includes('choose all that apply 2') ||
    questionKey.includes('_(2)') && /choose.?all/i.test(questionKey)
  ) {
    return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q2_engagement');
  }

  // "Choose one:_(2)" → Q4
  if (
    (/choose one/.test(keyNorm) || /choose one/.test(labelNorm)) &&
    (questionKey.includes('_(2)') || /\b2\b/.test(keyNorm) || /choose one 2/.test(keyNorm))
  ) {
    return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q4_outsource');
  }

  // Bare "Choose one:" (no _(2)) → Q5 disposition
  if (
    (/^choose one$/.test(keyNorm) || /^choose one$/.test(labelNorm) || keyNorm === 'choose one') &&
    !questionKey.includes('_(2)')
  ) {
    // Only if not already matched as Q4; disposition is default Choose one:
    if (!/outsource|outsourcing/.test(haystack)) {
      return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q5_disposition');
    }
  }

  // Bare "Choose all that apply:" → Q1
  if (
    (/^choose all that apply$/.test(keyNorm) || /^choose all that apply$/.test(labelNorm)) &&
    !questionKey.includes('_(2)')
  ) {
    return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q1_cxo');
  }

  for (const question of PARTNERS_CONNECT_SCORECARD) {
    for (const matcher of question.questionMatchers) {
      const m = normalize(matcher);
      if (!m) continue;
      // Skip overly generic matchers in the fallback loop — handled above.
      if (m === 'choose all that apply' || m === 'choose one') continue;
      if (haystack.includes(m) || keyNorm.includes(m) || labelNorm.includes(m)) {
        return question;
      }
    }
  }

  return undefined;
}

function resolveOptionPoints(question: ScoredQuestion, valueText: string): number | undefined {
  const valueNorm = normalize(valueText);
  if (!valueNorm) return undefined;

  for (const option of question.options) {
    for (const alias of option.aliases) {
      const a = normalize(alias);
      if (!a) continue;
      if (valueNorm === a || valueNorm.includes(a) || a.includes(valueNorm)) {
        return option.points;
      }
    }
  }
  return undefined;
}

/**
 * Score Partners Connect flow answers using the official per-option point matrix.
 * Percentage = (earned / 75) × 100.
 */
export function scoreFlowAnswers(
  answers: Array<{
    questionKey?: string;
    questionLabel?: string;
    valueText: string | null | undefined;
  }>,
): FlowScoreResult {
  let score = 0;
  let optionCount = 0;
  let scoredOptionCount = 0;
  const unmatched: string[] = [];

  for (const answer of answers) {
    const value = answer.valueText;
    if (typeof value !== 'string' || !value.trim()) continue;
    optionCount += 1;

    const question = resolveQuestion(answer.questionKey ?? '', answer.questionLabel ?? '');
    if (!question) {
      unmatched.push(`${answer.questionKey ?? '?'}::${value}`);
      continue;
    }

    const points = resolveOptionPoints(question, value);
    if (points === undefined) {
      unmatched.push(`${question.id}::${value}`);
      continue;
    }

    score += points;
    scoredOptionCount += 1;
  }

  // Cap at max in case of duplicate multi-select noise.
  score = Math.min(score, FLOW_MAX_SCORE);
  const percentage = Math.round((score / FLOW_MAX_SCORE) * 100);

  return {
    optionCount,
    scoredOptionCount,
    unmatched,
    score,
    maxScore: FLOW_MAX_SCORE,
    percentage,
  };
}

export function formatFlowScoreMessage(result: FlowScoreResult): string {
  return (
    `Thank you for completing the survey.\n` +
    `Your score is ${result.percentage}% ` +
    `(${result.score}/${result.maxScore}).`
  );
}
