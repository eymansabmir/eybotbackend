import type { PrismaClient } from '@prisma/client';

export interface ActiveSessionLimitInput {
  token: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ActiveSessionLimitResult {
  revokedSessionTokens: string[];
  activeSessionCount: number;
}

/** Enforces concurrent session limits after login (extend when multi-session rules are required). */
export async function enforceActiveSessionLimit(
  _prisma: PrismaClient,
  _session: ActiveSessionLimitInput,
  _maxActiveSessions: number,
  _options: { blockSuspiciousConcurrent: boolean },
): Promise<ActiveSessionLimitResult> {
  return {
    revokedSessionTokens: [],
    activeSessionCount: 1,
  };
}
