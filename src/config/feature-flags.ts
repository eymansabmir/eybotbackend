/**
 * Deployment slice used to pick a value from each feature flag.
 * Set APP_ENV explicitly for UAT (NODE_ENV alone cannot express uat).
 */
export type FeatureFlagEnv = 'dev' | 'uat' | 'prod';

/** Per-environment on/off (or extend later to string/enum payloads). */
export type EnvToggle = Record<FeatureFlagEnv, boolean>;

/**
 * Central feature-flag registry.
 *
 * Add new flags here as `{ flagKey: { dev, uat, prod } }`.
 * Prefer capability / provider switches over ad-hoc env branching in call sites.
 *
 * Usage:
 *   if (isFeatureEnabled('BSP_PROVIDER_META')) { ... }
 */
export const FEATURE_FLAGS = {
  /** Use Meta WhatsApp Cloud API as the BSP channel */
  BSP_PROVIDER_META: {
    dev: false,
    uat: false,
    prod: false,
  },
  /** Use Interakt as the BSP channel */
  BSP_PROVIDER_INTERAKT: {
    dev: true,
    uat: true,
    prod: false,
  },
} as const satisfies Record<string, EnvToggle>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

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
  // development | test | anything else → local/dev slice
  return 'dev';
}

/** Whether a flag is on for the current (or overridden) deployment slice. */
export function isFeatureEnabled(
  flag: FeatureFlagKey,
  appEnv: FeatureFlagEnv = resolveAppEnv(),
): boolean {
  return FEATURE_FLAGS[flag][appEnv];
}

/** Snapshot of every flag resolved for one environment (handy for diagnostics). */
export function getFeatureFlagSnapshot(
  appEnv: FeatureFlagEnv = resolveAppEnv(),
): Record<FeatureFlagKey, boolean> {
  const keys = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
  return Object.fromEntries(keys.map((key) => [key, FEATURE_FLAGS[key][appEnv]])) as Record<
    FeatureFlagKey,
    boolean
  >;
}
