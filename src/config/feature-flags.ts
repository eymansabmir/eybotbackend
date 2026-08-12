/**
 * Deployment slice used to pick a value from each feature flag.
 * Set APP_ENV explicitly for UAT (NODE_ENV alone cannot express uat).
 */
export type FeatureFlagEnv = 'dev' | 'uat' | 'prod';

/** Per-environment defaults when no FEATURE_* env override is set. */
export type EnvToggle = Record<FeatureFlagEnv, boolean>;

/**
 * Central feature-flag registry — **defaults only**.
 *
 * At runtime each flag resolves as:
 *   1. `FEATURE_<FLAG_NAME>` env var if set (true/false/1/0/yes/no) → no redeploy needed
 *   2. else the `{ dev, uat, prod }` default below for current APP_ENV
 *
 * Example (.env / Azure App Settings / docker-compose):
 *   APP_ENV=uat
 *   FEATURE_BSP_PROVIDER_INTERAKT=true
 *   FEATURE_BSP_PROVIDER_META=false
 *
 * Usage in code:
 *   if (isFeatureEnabled('BSP_PROVIDER_META')) { ... }
 */
export const FEATURE_FLAGS = {
  /** Use Meta WhatsApp Cloud API as the BSP channel */
  BSP_PROVIDER_META: {
    dev: true,
    uat: true,
    prod: false,
  },
  /** Use Interakt as the BSP channel */
  BSP_PROVIDER_INTERAKT: {
    dev: false,
    uat: false,
    prod: false,
  },
} as const satisfies Record<string, EnvToggle>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/** Env var name for a flag override, e.g. FEATURE_BSP_PROVIDER_META */
export function featureFlagEnvVar(flag: FeatureFlagKey): string {
  return `FEATURE_${flag}`;
}

function parseEnvBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const normalized = raw.trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return undefined;
}

/** Map NODE_ENV / APP_ENV → flag slice. Prefer APP_ENV when set. */
export function resolveAppEnv(
  source: { APP_ENV?: string; NODE_ENV?: string } = process.env,
): FeatureFlagEnv {
  const explicit = source.APP_ENV?.trim().toLowerCase();
  if (explicit === 'dev' || explicit === 'uat' || explicit === 'prod') {
    return explicit;
  }

  const nodeEnv = source.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === 'production') return 'prod';
  return 'dev';
}

/**
 * Whether a flag is on for this process.
 * Env override wins; otherwise uses code default for APP_ENV (or passed appEnv in tests).
 */
export function isFeatureEnabled(
  flag: FeatureFlagKey,
  appEnv: FeatureFlagEnv = resolveAppEnv(),
  envSource: NodeJS.ProcessEnv = process.env,
): boolean {
  const override = parseEnvBoolean(envSource[featureFlagEnvVar(flag)]);
  if (override !== undefined) return override;
  return FEATURE_FLAGS[flag][appEnv];
}

/** Snapshot of every flag as resolved at runtime (includes FEATURE_* overrides). */
export function getFeatureFlagSnapshot(
  appEnv: FeatureFlagEnv = resolveAppEnv(),
  envSource: NodeJS.ProcessEnv = process.env,
): Record<FeatureFlagKey, boolean> {
  const keys = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
  return Object.fromEntries(
    keys.map((key) => [key, isFeatureEnabled(key, appEnv, envSource)]),
  ) as Record<FeatureFlagKey, boolean>;
}
