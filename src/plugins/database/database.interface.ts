import type { PrismaClient } from '@prisma/client';

export const DATABASE_PLUGIN = 'database' as const;

export interface IDatabasePlugin {
  readonly prisma: PrismaClient;
}
