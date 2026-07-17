import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const CSRF_HEADER_NAME = 'x-csrf-token';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function createCsrfToken(): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(nonce)
    .digest('hex');
  return `${nonce}.${signature}`;
}

function verifyCsrfToken(token: string): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const nonce = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!nonce || !signature) return false;

  const expected = crypto
    .createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(nonce)
    .digest('hex');

  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function issueCsrfToken(_req: Request, res: Response): void {
  const token = createCsrfToken();
  res.setHeader(CSRF_HEADER_NAME, token);
  res.json({ csrfToken: token });
}

function isCsrfExemptPath(pathname: string): boolean {
  return (
    pathname === '/api/csrf-token'
    || pathname.startsWith('/api/auth')
    || pathname.startsWith('/api/webhooks')
    || pathname.startsWith('/api/v1/')
    || pathname === '/health'
  );
}

function requestPath(req: Request): string {
  const url = req.originalUrl.split('?')[0] ?? req.path;
  return url;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }

  const path = requestPath(req);
  if (isCsrfExemptPath(path)) {
    next();
    return;
  }

  if (req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  const headerToken = req.headers[CSRF_HEADER_NAME];
  const headerValue = typeof headerToken === 'string' ? headerToken.trim() : '';

  if (!headerValue || !verifyCsrfToken(headerValue)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token',
    });
    return;
  }

  next();
}
