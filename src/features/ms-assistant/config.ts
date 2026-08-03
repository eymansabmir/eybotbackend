import { z } from 'zod';

const msAssistantEnvSchema = z.object({
  MANAGED_SERVICES_ASSISTANT_ENABLED: z.enum(['true', 'false']).optional(),
  /** GitHub PAT (Copilot) or OpenAI key depending on providers below. */
  OPENAI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  /**
   * Only used when MS_ASSISTANT_LLM_PROVIDER=openai.
   * GitHub Models (models.github.ai) is retired — do not use for EY.
   */
  OPENAI_BASE_URL: z.string().url().optional(),
  /** copilot = GitHub Copilot SDK (default, EY-friendly). openai = OpenAI-compatible HTTP. */
  MS_ASSISTANT_LLM_PROVIDER: z.enum(['copilot', 'openai']).default('copilot'),
  /** local = Xenova on-device (default). openai = remote embeddings API. */
  MS_ASSISTANT_EMBED_PROVIDER: z.enum(['local', 'openai']).default('local'),
  MS_ASSISTANT_CHAT_MODEL: z.string().default('gpt-4.1'),
  MS_ASSISTANT_EMBED_MODEL: z.string().default('text-embedding-3-small'),
  MS_ASSISTANT_LOCAL_EMBED_MODEL: z.string().default('Xenova/all-MiniLM-L6-v2'),
  /**
   * Vector store for RAG. Default pgvector uses the app DATABASE_URL.
   * qdrant kept for local rollback only.
   */
  MS_ASSISTANT_VECTOR_STORE: z.enum(['pgvector', 'qdrant']).default('pgvector'),
  QDRANT_URL: z.string().url().optional(),
  /** Use a distinct name when switching embed dims (local=384 vs openai=1536). */
  QDRANT_COLLECTION: z.string().default('ey_managed_services_local'),
  MS_ASSISTANT_TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  MS_ASSISTANT_MEMORY_TTL_SEC: z.coerce.number().int().min(60).default(86_400),
  MS_ASSISTANT_MEMORY_MAX_TURNS: z.coerce.number().int().min(2).max(40).default(8),
  MS_ASSISTANT_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.25),
  MS_ASSISTANT_KNOWLEDGE_DIR: z.string().default('knowledge/managed-services'),
  MS_ASSISTANT_JSON_OBJECT: z.enum(['true', 'false']).default('true'),
});

export type MsAssistantConfig = z.infer<typeof msAssistantEnvSchema> & {
  enabled: boolean;
};

export function loadMsAssistantConfig(
  envSource: NodeJS.ProcessEnv = process.env,
): MsAssistantConfig {
  const parsed = msAssistantEnvSchema.parse(envSource);
  return {
    ...parsed,
    enabled: parsed.MANAGED_SERVICES_ASSISTANT_ENABLED === 'true',
  };
}

export function resolveMsAssistantApiKey(config: MsAssistantConfig): string | undefined {
  const key = config.OPENAI_API_KEY?.trim() || config.GITHUB_TOKEN?.trim();
  return key || undefined;
}

/** True when chat provider needs a token (always for copilot/openai). */
export function msAssistantNeedsApiKey(config: MsAssistantConfig): boolean {
  return (
    config.MS_ASSISTANT_LLM_PROVIDER === 'copilot' ||
    config.MS_ASSISTANT_LLM_PROVIDER === 'openai' ||
    config.MS_ASSISTANT_EMBED_PROVIDER === 'openai'
  );
}
