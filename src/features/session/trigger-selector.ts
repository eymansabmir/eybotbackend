import type { TriggerConfig } from '../../schemas/flow.schema';
import { ConditionEvaluator } from './condition.evaluator';
import { normalizeTriggerText, simplifyTriggerText } from './trigger-normalization';

export interface TriggerSelectableFlow {
  id?: string;
  triggerConfig: TriggerConfig;
  updatedAt?: Date;
}

function hasExplicitStartCondition(config: TriggerConfig): boolean {
  const hasKeywords = Boolean(config.keywords?.some((kw) => kw.trim().length > 0));
  const hasComparisons = Boolean(config.comparisons?.some((c) => c.value.trim().length > 0));
  return hasKeywords || hasComparisons;
}

function scoreOperator(operator: string): number {
  switch (operator) {
    case 'EQUALS':
      return 100;
    case 'STARTS_WITH':
    case 'ENDS_WITH':
      return 70;
    case 'CONTAINS':
      return 50;
    default:
      return 0;
  }
}

function scoreExplicitMatch(text: string, config: TriggerConfig): number {
  const input = normalizeTriggerText(text);
  const simplifiedInput = simplifyTriggerText(text);
  let score = 0;

  const keywords = (config.keywords ?? []).map((k) => simplifyTriggerText(k)).filter(Boolean);
  for (const keyword of keywords) {
    if (input.includes(keyword) || simplifiedInput.includes(keyword)) {
      score += 40;
    }
  }

  for (const comparison of config.comparisons ?? []) {
    const target = normalizeTriggerText(comparison.value);
    const targetSimplified = simplifyTriggerText(comparison.value);
    if (!target) continue;

    const matched = (() => {
      switch (comparison.operator) {
        case 'EQUALS':
          return input === target || simplifiedInput === targetSimplified;
        case 'CONTAINS':
          return input.includes(target) || simplifiedInput.includes(targetSimplified);
        case 'STARTS_WITH':
          return input.startsWith(target) || simplifiedInput.startsWith(targetSimplified);
        case 'ENDS_WITH':
          return input.endsWith(target) || simplifiedInput.endsWith(targetSimplified);
        default:
          return false;
      }
    })();

    if (matched) {
      score += scoreOperator(comparison.operator);
    }
  }

  return score;
}

export function selectFlowByTrigger<T extends TriggerSelectableFlow>(flows: T[], text: string): T | null {
  const explicitMatches: Array<{ flow: T; score: number }> = [];
  const catchAllMatches: T[] = [];

  for (const flow of flows) {
    const config = flow.triggerConfig;
    if (!ConditionEvaluator.evaluate(text, config)) {
      continue;
    }

    if (hasExplicitStartCondition(config)) {
      explicitMatches.push({ flow, score: scoreExplicitMatch(text, config) });
    } else {
      catchAllMatches.push(flow);
    }
  }

  if (explicitMatches.length > 0) {
    explicitMatches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const aTime = a.flow.updatedAt ? a.flow.updatedAt.getTime() : 0;
      const bTime = b.flow.updatedAt ? b.flow.updatedAt.getTime() : 0;
      return bTime - aTime;
    });
    return explicitMatches[0]?.flow ?? null;
  }

  if (catchAllMatches.length > 0) {
    catchAllMatches.sort((a, b) => {
      const aTime = a.updatedAt ? a.updatedAt.getTime() : 0;
      const bTime = b.updatedAt ? b.updatedAt.getTime() : 0;
      return bTime - aTime;
    });
    return catchAllMatches[0] ?? null;
  }

  return null;
}
