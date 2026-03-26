import type { TriggerConfig } from '../../schemas/flow.schema';

export class ConditionEvaluator {
    /**
     * Evaluates whether an incoming text message matches a flow's Trigger Configuration.
     * Takes inspiration from Autobot's `messageMatchStartCondition`.
     */
    static evaluate(text: string, config: TriggerConfig | null | undefined): boolean {
        if (!config) return true; // Empty config means it acts as a catch-all
        if (!text) return false;

        // Fallback for legacy "keywords" array if no advanced comparisons exist
        if ((!config.comparisons || config.comparisons.length === 0) && config.keywords && config.keywords.length > 0) {
            const lowerText = text.toLowerCase();
            return config.keywords.some(kw => lowerText.includes(kw.toLowerCase()));
        }

        // If no comparisons and no legacy keywords, it's a catch-all
        if (!config.comparisons || config.comparisons.length === 0) {
            return true;
        }

        const logicalOperator = config.logicalOperator || 'OR';

        const matchComparison = (inputValue: string, op: string, val: string) => {
            const input = inputValue.trim().toLowerCase();
            const target = val.trim().toLowerCase();
            
            if (!target) return false; // Safety check

            switch (op) {
                case 'CONTAINS': return input.includes(target);
                case 'EQUALS': return input === target;
                case 'STARTS_WITH': return input.startsWith(target);
                case 'ENDS_WITH': return input.endsWith(target);
                default: return false;
            }
        };

        if (logicalOperator === 'AND') {
            return config.comparisons.every(c => matchComparison(text, c.operator, c.value));
        } else {
            return config.comparisons.some(c => matchComparison(text, c.operator, c.value));
        }
    }
}
