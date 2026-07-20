const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Redact PII in structured log fields (emails partially masked). */
export function redactLogFields<T extends Record<string, unknown>>(fields: T): T {
  const out = { ...fields };
  for (const [key, value] of Object.entries(out)) {
    if (key.toLowerCase().includes('email') && typeof value === 'string') {
      (out as Record<string, unknown>)[key] = maskEmail(value);
      continue;
    }
    if (typeof value === 'string') {
      (out as Record<string, unknown>)[key] = value.replace(EMAIL_RE, (m) => maskEmail(m));
    }
  }
  return out;
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
