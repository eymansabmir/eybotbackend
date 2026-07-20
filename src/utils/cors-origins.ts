import { env } from '../config/env';

/** Origins permitted for CORS and Better Auth (FRONTEND_URL + TRUSTED_ORIGINS + dev aliases). */
export function buildTrustedFrontendOrigins(): string[] {
  const origins = new Set<string>();
  const frontend = (env.FRONTEND_URL || 'http://localhost:5173').trim();
  origins.add(frontend);

  if (env.TRUSTED_ORIGINS) {
    for (const entry of env.TRUSTED_ORIGINS.split(',')) {
      const trimmed = entry.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  if (env.NODE_ENV !== 'production') {
    for (const url of [...origins]) {
      try {
        const parsed = new URL(url);
        for (const host of ['localhost', '127.0.0.1']) {
          if (parsed.hostname === host) continue;
          parsed.hostname = host;
          origins.add(parsed.origin);
        }
      } catch {
        // ignore malformed entries
      }
    }
  }

  return [...origins];
}

/** Express/cors origin callback — strict in production, permissive for local dev hosts. */
export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  if (!origin) {
    callback(null, true);
    return;
  }

  const allowed = buildTrustedFrontendOrigins();
  if (allowed.includes(origin)) {
    callback(null, true);
    return;
  }

  if (env.NODE_ENV !== 'production') {
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        callback(null, true);
        return;
      }
    } catch {
      // fall through
    }
  }

  callback(new Error(`CORS blocked origin: ${origin}`));
}

export function authUsesFrontendOrigin(): boolean {
  return env.AUTH_USE_FRONTEND_ORIGIN === 'true';
}

/** Public Better Auth base URL as seen by the browser (must match frontend auth client). */
export function resolveBetterAuthClientBaseUrl(): string | undefined {
  const frontend = env.FRONTEND_URL?.trim();
  if (authUsesFrontendOrigin() && frontend) {
    return `${frontend.replace(/\/$/, '')}/api/auth`;
  }

  const backend = env.BETTER_AUTH_URL?.trim();
  if (backend) {
    return `${backend.replace(/\/$/, '')}/api/auth`;
  }

  const websiteHost = process.env.WEBSITE_HOSTNAME?.trim();
  if (websiteHost) {
    return `https://${websiteHost}/api/auth`;
  }

  return undefined;
}

/** True when the SPA and API are on different origins (Azure SWA + App Service, or Vite + local API). */
export function needsCrossSiteAuthCookies(): boolean {
  const frontend = (env.FRONTEND_URL || 'http://localhost:5173').trim();
  try {
    const frontendOrigin = new URL(frontend).origin;
    const backendPublic = env.BETTER_AUTH_URL?.trim();
    if (backendPublic) {
      return frontendOrigin !== new URL(backendPublic).origin;
    }
    return frontendOrigin !== 'http://localhost:3000';
  } catch {
    return true;
  }
}

/** Better Auth session cookies for cross-origin browser clients. */
export function buildSessionCookieAttributes(): {
  sameSite: 'lax' | 'none';
  secure: boolean;
  httpOnly: true;
} {
  const isProduction = env.NODE_ENV === 'production';
  if (needsCrossSiteAuthCookies()) {
    return {
      sameSite: 'none',
      secure: true,
      httpOnly: true,
    };
  }
  if (authUsesFrontendOrigin()) {
    return {
      sameSite: 'lax',
      secure: isProduction,
      httpOnly: true,
    };
  }
  return {
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: true,
  };
}
