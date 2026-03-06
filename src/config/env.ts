import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().url().optional(),
  WHATSAPP_API_URL: z.string().url().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  /** Google Cloud Storage */
  GCS_PROJECT_ID: z.string().optional(),
  GCS_BUCKET_NAME: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),

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
