import { z } from 'zod';

export const ComparatorSchema = z.enum([
  'eq',
  'neq',
  'contains',
  'not_contains',
  'gt',
  'lt',
  'gte',
  'lte',
  'exists',
  'not_exists',
  'regex',
]);

export type Comparator = z.infer<typeof ComparatorSchema>;

export const LeafRuleSchema = z.object({
  variable: z.string(),
  comparator: ComparatorSchema,
  value: z.any().optional(),
});

export type LeafRule = z.infer<typeof LeafRuleSchema>;

export const ConditionExpressionSchema: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.union([
    LeafRuleSchema,
    z.object({
      operator: z.enum(['AND', 'OR']),
      rules: z.array(ConditionExpressionSchema),
    }),
  ])
);

export type ConditionExpression = LeafRule | {
  operator: 'AND' | 'OR';
  rules: ConditionExpression[];
};
