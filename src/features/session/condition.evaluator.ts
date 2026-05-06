import type { TriggerConfig } from '../../schemas/flow.schema';
import { normalizeTriggerText, simplifyTriggerText } from './trigger-normalization';

export class ConditionEvaluator {
    /**
     * Evaluates whether an incoming text message matches a flow's Trigger Configuration.
     * Takes inspiration from Autobot's `messageMatchStartCondition`.
     */
    static evaluate(text: string, config: TriggerConfig | null | undefined): boolean {
        if (!config) return false; // Missing config means no trigger defined
        if (config.enabled === false) return false;

        const normalizedText = normalizeTriggerText(text);
        const simplifiedText = simplifyTriggerText(text);
        if (!normalizedText) {
            // Empty inbound text can only match catch-all config
            const hasKeywords = Boolean(config.keywords && config.keywords.some(kw => kw.trim().length > 0));
            const hasComparisons = Boolean(config.comparisons && config.comparisons.some(c => c.value.trim().length > 0));
            return !hasKeywords && !hasComparisons;
        }

        // Fallback for legacy "keywords" array if no advanced comparisons exist
        if ((!config.comparisons || config.comparisons.length === 0) && config.keywords && config.keywords.length > 0) {
            const keywords = config.keywords.map(kw => simplifyTriggerText(kw)).filter(Boolean);
            if (keywords.length === 0) return false;
            return keywords.some(kw => normalizedText.includes(kw) || simplifiedText.includes(kw));
        }

        // If no comparisons and no legacy keywords, it's not a match (disabling unintentional catch-all)
        if (!config.comparisons || config.comparisons.length === 0) {
            return false;
        }

        const logicalOperator = config.logicalOperator || 'OR';
        const effectiveComparisons = config.comparisons.filter(c => c.value.trim().length > 0);
        if (effectiveComparisons.length === 0) {
            return false;
        }

        const matchComparison = (inputValue: string, op: string, val: string) => {
            const input = normalizeTriggerText(inputValue);
            const inputSimplified = simplifyTriggerText(inputValue);
            const target = normalizeTriggerText(val);
            const targetSimplified = simplifyTriggerText(val);
            
            if (!target) return false; // Safety check

            switch (op) {
                case 'CONTAINS': return input.includes(target) || inputSimplified.includes(targetSimplified);
                case 'EQUALS': return input === target || inputSimplified === targetSimplified;
                case 'STARTS_WITH': return input.startsWith(target) || inputSimplified.startsWith(targetSimplified);
                case 'ENDS_WITH': return input.endsWith(target) || inputSimplified.endsWith(targetSimplified);
                default: return false;
            }
        };

        if (logicalOperator === 'AND') {
            return effectiveComparisons.every(c => matchComparison(normalizedText, c.operator, c.value));
        } else {
            return effectiveComparisons.some(c => matchComparison(normalizedText, c.operator, c.value));
        }
    }
}
