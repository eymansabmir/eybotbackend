import { z } from 'zod';

export const EdgeSchema = z.object({
  id: z.string(),
  sourceNodeId: z.string(),
  sourceBranchKey: z.string(),
  targetNodeId: z.string(),
});

export type Edge = z.infer<typeof EdgeSchema>;
