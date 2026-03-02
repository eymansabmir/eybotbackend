import { z } from 'zod';
import { NodeType } from './node-types.enum';
import { NodeDataSchema } from './node-data.schema';
export { InteractionModeSchema, NodeInteractionSchema } from './node-interaction.schema';
export type { NodeInteraction } from './node-interaction.schema';

export const BranchSchema = z.object({
  key: z.string(),
  label: z.string(),
});

export type Branch = z.infer<typeof BranchSchema>;

export const NodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type NodePosition = z.infer<typeof NodePositionSchema>;

export const NodeSchema = z
  .object({
    id: z.string(),
    type: z.nativeEnum(NodeType),
    label: z.string(),
    position: NodePositionSchema,
    data: z.record(z.any()),
    branches: z.array(BranchSchema),
  })
  .superRefine((node, ctx) => {
    const result = NodeDataSchema.safeParse({ type: node.type, ...node.data });
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['data', ...issue.path],
          message: issue.message,
        });
      }
    }
  });

export type Node = z.infer<typeof NodeSchema>;
