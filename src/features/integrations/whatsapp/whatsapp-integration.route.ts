import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const WHATSAPP_CLOUD_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';

const GetPhoneNumberSchema = z.object({
  systemToken: z.string().min(1, 'System token is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
});

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function inferPublicBaseUrl(req: Request): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    return normalizeBaseUrl(configured);
  }

  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.get('host');
  if (!host) return '';
  return `${protocol}://${host}`;
}

function resolveWebhookPath(): { callbackPath: string; usesCustomWebhookPath: boolean } {
  const custom = process.env.WEBHOOK_URL?.trim();
  if (!custom) {
    return { callbackPath: '/api/webhooks/whatsapp', usesCustomWebhookPath: false };
  }
  const normalized = custom.replace(/^\/+/, '');
  return { callbackPath: `/api/v1/${normalized}`, usesCustomWebhookPath: true };
}

/**
 * Calls Meta's Graph API to resolve the actual display phone number
 * from a Phone Number ID + System User Access Token.
 *
 * This is the same approach autobot uses in getPhoneNumber.ts:
 *   GET /{phoneNumberId}?fields=display_phone_number
 *   Authorization: Bearer {systemToken}
 */
async function getPhoneNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { systemToken, phoneNumberId } = GetPhoneNumberSchema.parse(req.body);

    const metaUrl = `${WHATSAPP_CLOUD_API_URL}/${phoneNumberId}?fields=display_phone_number,verified_name`;

    const metaResponse = await fetch(metaUrl, {
      headers: {
        Authorization: `Bearer ${systemToken}`,
      },
    });

    if (!metaResponse.ok) {
      const errorBody = await metaResponse.json().catch(() => ({}));
      const metaError = (errorBody as any)?.error;

      logger.warn(
        { phoneNumberId, statusCode: metaResponse.status, metaError },
        'Failed to fetch phone number from Meta API',
      );

      if (metaResponse.status === 400 || metaResponse.status === 404) {
        res.status(400).json({
          error: 'InvalidPhoneNumberId',
          message: metaError?.message || 'Phone Number ID is invalid or not accessible with this token.',
        });
        return;
      }

      if (metaResponse.status === 401 || metaResponse.status === 403) {
        res.status(401).json({
          error: 'InvalidToken',
          message: 'The system token is invalid or does not have the required permissions.',
        });
        return;
      }

      res.status(502).json({
        error: 'MetaApiError',
        message: metaError?.message || 'Failed to communicate with Meta API.',
      });
      return;
    }

    const data = await metaResponse.json() as { display_phone_number?: string; verified_name?: string };

    if (!data.display_phone_number) {
      res.status(404).json({
        error: 'PhoneNumberNotFound',
        message: 'Could not resolve display phone number for this Phone Number ID.',
      });
      return;
    }

    // Strip formatting characters to get a clean E.164-ish number for wa.me links
    const cleanNumber = data.display_phone_number.replace(/[\s\-()]/g, '');

    res.json({
      displayPhoneNumber: cleanNumber,
      formattedPhoneNumber: data.display_phone_number,
      verifiedName: data.verified_name || null,
    });
  } catch (err) {
    next(err);
  }
}

function getWebhookConfig(req: Request, res: Response): void {
  const baseUrl = inferPublicBaseUrl(req);
  const { callbackPath, usesCustomWebhookPath } = resolveWebhookPath();
  const fallbackPath = '/api/webhooks/whatsapp';

  const asUrl = (path: string): string => (baseUrl ? `${baseUrl}${path}` : path);

  res.json({
    callbackUrl: asUrl(callbackPath),
    fallbackCallbackUrl: asUrl(fallbackPath),
    usesCustomWebhookPath,
    verifyTokenConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    verifyTokenHint: 'Use backend WHATSAPP_VERIFY_TOKEN value',
  });
}

export function createWhatsAppIntegrationRouter(): Router {
  const router = Router();

  // POST /api/integrations/whatsapp/phone-number
  router.post('/phone-number', getPhoneNumber);
  router.get('/webhook-config', getWebhookConfig);

  return router;
}
