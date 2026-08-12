import { describe, expect, it } from 'vitest';
import {
  FEATURE_FLAGS,
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

  it('reads the correct env slice for a flag', () => {
    expect(isFeatureEnabled('BSP_PROVIDER_INTERAKT', 'dev')).toBe(
      FEATURE_FLAGS.BSP_PROVIDER_INTERAKT.dev,
    );
    expect(isFeatureEnabled('BSP_PROVIDER_META', 'prod')).toBe(FEATURE_FLAGS.BSP_PROVIDER_META.prod);
  });

  it('returns a full snapshot for an env', () => {
    const snap = getFeatureFlagSnapshot('dev');
    expect(snap.BSP_PROVIDER_META).toBe(FEATURE_FLAGS.BSP_PROVIDER_META.dev);
    expect(snap.BSP_PROVIDER_INTERAKT).toBe(FEATURE_FLAGS.BSP_PROVIDER_INTERAKT.dev);
  });
});
