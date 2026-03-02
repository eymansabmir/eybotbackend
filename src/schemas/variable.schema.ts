import { z } from 'zod';

export const VariableScopeSchema = z.enum(['session', 'contact']);

export type VariableScope = z.infer<typeof VariableScopeSchema>;

export const VariableAssignmentSchema = z.object({
  variable: z.string(),
  value: z.string(),
  scope: VariableScopeSchema,
});

export type VariableAssignment = z.infer<typeof VariableAssignmentSchema>;

export const InputTypeSchema = z.enum(['text', 'number', 'email', 'phone', 'any']);

export type InputType = z.infer<typeof InputTypeSchema>;

export const ValidationRuleSchema = z.object({
  pattern: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type ValidationRule = z.infer<typeof ValidationRuleSchema>;
