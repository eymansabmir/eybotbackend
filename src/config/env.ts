import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().url().optional(),
  RABBITMQ_URL: z.string().url().optional(),
  /** WhatsApp channel provider: meta (Cloud API), interakt, or stub */
  WHATSAPP_PROVIDER: z.enum(['meta', 'interakt', 'stub']).optional(),
  WHATSAPP_API_URL: z.string().url().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  /** Interakt WhatsApp BSP */
  INTERAKT_API_URL: z.string().url().default('https://api.interakt.ai/v1'),
  INTERAKT_API_KEY: z.string().optional(),
  INTERAKT_DEFAULT_COUNTRY_CODE: z.string().default('+91'),
  INTERAKT_WEBHOOK_SECRET: z.string().optional(),
  /** Business WhatsApp number / phoneNumberId used for session + credential scoping on inbound */
  INTERAKT_WA_BUSINESS_NUMBER: z.string().optional(),
  /** Fallback org when webhook URL has no :orgId and no credential match */
  INTERAKT_ORG_ID: z.string().optional(),
  /** Optional credential id stamped on inbound jobs (BSP env-scoped webhook) */
  INTERAKT_CREDENTIAL_ID: z.string().optional(),
  /**
   * Hardcoded Interakt/BSP webhook path (exact mount), e.g.
   * /api/v1/workspaces/ws_123456/whatsapp/cred_789012/webhook
   */
  BSP_WEBHOOK_PATH: z.string().optional(),
  /** When true (default if BSP_WEBHOOK_PATH set), skip DB credential lookup and use env/path ids */
  BSP_WEBHOOK_BYPASS_CREDENTIAL_LOOKUP: z.enum(['true', 'false']).optional(),

  /** EY Managed Services WhatsApp Assistant (validated lightly; full config in ms-assistant/config) */
  MANAGED_SERVICES_ASSISTANT_ENABLED: z.enum(['true', 'false']).optional(),
  OPENAI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  QDRANT_URL: z.string().url().optional(),
  QDRANT_COLLECTION: z.string().optional(),

  FRONTEND_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET is required'),
  BETTER_AUTH_URL: z.string().url().optional(),
  /** When true, browser calls auth via FRONTEND_URL (e.g. SWA /api proxy); session cookies are first-party. */
  AUTH_USE_FRONTEND_ORIGIN: z.enum(['true', 'false']).optional(),
  /** Override session cookie SameSite: none | lax (use none for SWA + App Service). */
  AUTH_COOKIE_SAME_SITE: z.enum(['none', 'lax']).optional(),

  /** Auth email OTP */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_OTP_DEV_FALLBACK: z.enum(['true', 'false']).optional(),
  MAX_ACTIVE_USER_SESSIONS: z.string().optional(),
  BLOCK_SUSPICIOUS_CONCURRENT_SESSIONS: z.enum(['true', 'false']).optional(),

  /** Google Cloud Storage */
  GCS_PROJECT_ID: z.string().optional(),
  GCS_BUCKET_NAME: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),
  GCS_CREDENTIALS_JSON: z.string().optional(),

  /** AWS S3 */
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  /** Azure Blob */
  AZURE_STORAGE_ACCOUNT: z.string().optional(),
  AZURE_STORAGE_ACCESS_KEY: z.string().optional(),
  AZURE_CONTAINER_NAME: z.string().optional(),

  /** Storage provider selection */
  STORAGE_PROVIDER: z.enum(["gcs", "s3", "azure"]).default("gcs"),

  /** Base CDN/Media URL */
  BASE_MEDIA_URL: z.string().url().optional(),

  /** Integration secret encryption key (32-byte hex/base64/raw) */
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),

  /** Google Sheets OAuth */
  GOOGLE_SHEETS_CLIENT_ID: z.string().optional(),
  GOOGLE_SHEETS_CLIENT_SECRET: z.string().optional(),
  ALLOWED_DOMAINS: z.string().optional(),
  TRUSTED_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('❌ Invalid environment variables:');
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

/** Validated env singleton — available at import time */
export const env = validateEnv();
