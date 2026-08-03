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
 *
 * Interakt/Meta field keys are NOT stable across Flow versions:
 * - older: bare `Choose all that apply:` = Q1 CXO, `_(2)` = Q2 engagement, `operations_to_take_over` = Q3
 * - ey_partners_connect_form_final: bare `Choose all that apply:` = Q3 take-over options,
 *   `_(2)` = Q1 CXO options (engagement may be absent / differently keyed)
 * Always prefer resolving by option value when possible.
 */
const PARTNERS_CONNECT_SCORECARD: ScoredQuestion[] = [
  {
    id: 'q1_cxo',
    // Never match via "choose all that apply" — Meta reuses that key; _(2) order swaps across Flows.
    questionMatchers: [
      'what keeps your clients cxo awake at night',
      'what keeps the clients cxo awake at night',
      'cxo awake',
    ],
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
    ],
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
    ],
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
    ],
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
    ],
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

/** Exact alias hit — used so "Security & Operations" does not score as engagement "Operations". */
function findExactOption(
  question: ScoredQuestion,
  valueNorm: string,
): ScoredOption | undefined {
  for (const option of question.options) {
    for (const alias of option.aliases) {
      if (normalize(alias) === valueNorm) return option;
    }
  }
  return undefined;
}

/**
 * Resolve question from the selected option text.
 * Meta reuses "Choose all that apply:" keys across Flow versions, so option
 * identity is more reliable than questionKey.
 */
function resolveQuestionByOption(valueText: string): ScoredQuestion | undefined {
  const valueNorm = normalize(valueText);
  if (!valueNorm) return undefined;

  let best: { question: ScoredQuestion; aliasLen: number } | undefined;
  for (const question of PARTNERS_CONNECT_SCORECARD) {
    for (const option of question.options) {
      for (const alias of option.aliases) {
        const a = normalize(alias);
        if (!a || a !== valueNorm) continue;
        if (!best || a.length > best.aliasLen) {
          best = { question, aliasLen: a.length };
        }
      }
    }
  }
  return best?.question;
}

function resolveQuestionByKey(
  questionKey: string,
  questionLabel: string,
): ScoredQuestion | undefined {
  const keyNorm = normalize(questionKey);
  const labelNorm = normalize(questionLabel);
  const haystack = `${keyNorm} ${labelNorm}`;

  if (
    keyNorm.includes('operations to take over') ||
    keyNorm.includes('operations_to_take_over') ||
    labelNorm.includes('operations to take over') ||
    /take over an area|take over operations/.test(haystack)
  ) {
    return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q3_takeover');
  }

  // Indexed choose-one is stable (Q4) across known Flow versions.
  if (
    (/choose one/.test(keyNorm) || /choose one/.test(labelNorm)) &&
    (questionKey.includes('_(2)') || /\b2\b/.test(keyNorm) || /choose one 2/.test(keyNorm))
  ) {
    return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q4_outsource');
  }

  if (
    (/^choose one$/.test(keyNorm) || /^choose one$/.test(labelNorm) || keyNorm === 'choose one') &&
    !questionKey.includes('_(2)')
  ) {
    if (!/outsource|outsourcing/.test(haystack)) {
      return PARTNERS_CONNECT_SCORECARD.find((q) => q.id === 'q5_disposition');
    }
  }

  // Do NOT map bare / _(2) "Choose all that apply" by key — swapped in newer Flows.
  for (const question of PARTNERS_CONNECT_SCORECARD) {
    for (const matcher of question.questionMatchers) {
      const m = normalize(matcher);
      if (!m) continue;
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

  const exact = findExactOption(question, valueNorm);
  if (exact) return exact.points;

  // Soft match only for longer aliases (avoid "operations" ⊂ "security and operations").
  for (const option of question.options) {
    for (const alias of option.aliases) {
      const a = normalize(alias);
      if (!a || a.length < 8) continue;
      if (valueNorm.includes(a) || a.includes(valueNorm)) {
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

    const question =
      resolveQuestionByOption(value) ??
      resolveQuestionByKey(answer.questionKey ?? '', answer.questionLabel ?? '');
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
    `The Managed Services Opportunity Score is ${result.percentage}%. ` +
    `The MS self-assessment and personalized roadmap for you and your CXO is available at https://www.ey.com/en_in .`
  );
}
