import { z } from 'zod';

export const InteractionModeSchema = z.enum(['output', 'input']);

export const NodeInteractionSchema = z.object({
  mode: InteractionModeSchema,
  input: z.object({
    type: z.enum(['text', 'choice']),
    variableName: z.string().optional(),
    variableScope: z.enum(['session', 'contact']).optional(),
    timeoutSeconds: z.number().optional(),
    options: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          branchKey: z.string(),
        })
      )
      .optional(),
    defaultBranchKey: z.string().optional(),
  }).optional(),
});

export type NodeInteraction = z.infer<typeof NodeInteractionSchema>;
