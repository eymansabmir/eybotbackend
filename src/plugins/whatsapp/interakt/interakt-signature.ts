import crypto from 'crypto';

/**
 * Verifies Interakt-Signature: HMAC-SHA256 of raw body, hex-encoded, prefixed with `sha256=`.
 * @see https://www.interakt.shop/resource-center/interakts-webhooks/
 */
export function verifyInteraktSignature(
  secret: string,
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;

  const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

  const received = signatureHeader.trim();
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
