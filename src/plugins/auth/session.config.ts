/** Max inactivity before an auth session expires (Better Auth `session.expiresIn`). */
export const SESSION_IDLE_TIMEOUT_SEC = 60 * 60 * 24 * 7;

/** Refresh session expiry when the user is active at least this often (Better Auth `session.updateAge`). */
export const SESSION_UPDATE_AGE_SEC = 60 * 60 * 24;

/** Better Auth session cookie cache lifetime. */
export const SESSION_COOKIE_CACHE_MAX_AGE_SEC = 5 * 60;
