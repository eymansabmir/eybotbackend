import { describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS,
  featureFlagEnvVar,
  getFeatureFlagSnapshot,
  isFeatureEnabled,
  resolveAppEnv,
} from './feature-flags';

describe('feature-flags', () => {
  it('resolves APP_ENV over NODE_ENV', () => {
    expect(resolveAppEnv({ APP_ENV: 'uat', NODE_ENV: 'production' })).toBe('uat');
    expect(resolveAppEnv({ APP_ENV: 'prod', NODE_ENV: 'development' })).toBe('prod');
  });

  it('falls back from NODE_ENV when APP_ENV is unset', () => {
    expect(resolveAppEnv({ NODE_ENV: 'production' })).toBe('prod');
    expect(resolveAppEnv({ NODE_ENV: 'development' })).toBe('dev');
    expect(resolveAppEnv({ NODE_ENV: 'test' })).toBe('dev');
  });

  it('reads code defaults for an env slice when no FEATURE_* override', () => {
    const env = {};
    expect(isFeatureEnabled('BSP_PROVIDER_INTERAKT', 'dev', env)).toBe(
      FEATURE_FLAGS.BSP_PROVIDER_INTERAKT.dev,
    );
    expect(isFeatureEnabled('BSP_PROVIDER_META', 'prod', env)).toBe(
      FEATURE_FLAGS.BSP_PROVIDER_META.prod,
    );
  });

  it('FEATURE_* env var overrides code defaults (no redeploy)', () => {
    const env = {
      [featureFlagEnvVar('BSP_PROVIDER_META')]: 'true',
      [featureFlagEnvVar('BSP_PROVIDER_INTERAKT')]: 'false',
    };
    expect(isFeatureEnabled('BSP_PROVIDER_META', 'dev', env)).toBe(true);
    expect(isFeatureEnabled('BSP_PROVIDER_INTERAKT', 'dev', env)).toBe(false);
  });

  it('returns a full snapshot with overrides applied', () => {
    const env = { [featureFlagEnvVar('BSP_PROVIDER_META')]: '1' };
    const snap = getFeatureFlagSnapshot('prod', env);
    expect(snap.BSP_PROVIDER_META).toBe(true);
    expect(snap.BSP_PROVIDER_INTERAKT).toBe(FEATURE_FLAGS.BSP_PROVIDER_INTERAKT.prod);
  });
});
