import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const CSRF_HEADER_NAME = 'x-csrf-token';

function createCsrfToken(): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(nonce)
    .digest('hex');
  return `${nonce}.${signature}`;
}

/** Kept so the frontend CSRF fetch still succeeds; verification is disabled. */
export function issueCsrfToken(_req: Request, res: Response): void {
  const token = createCsrfToken();
  res.setHeader(CSRF_HEADER_NAME, token);
  res.json({ csrfToken: token });
}

/** TEMP: CSRF fully disabled — allow all state-changing requests. */
export function csrfProtection(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
