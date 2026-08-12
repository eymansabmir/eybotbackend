import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('resolveWhatsAppProviderName', () => {
  beforeEach(() => {
    vi.stubGlobal('logger', {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock('../../config/env');
    vi.doUnmock('../../config/feature-flags');
  });

  async function loadResolver(opts: {
    whatsappProvider?: 'meta' | 'interakt' | 'stub';
    meta?: boolean;
    interakt?: boolean;
  }) {
    vi.doMock('../../config/env', () => ({
      env: { WHATSAPP_PROVIDER: opts.whatsappProvider },
    }));
    vi.doMock('../../config/feature-flags', () => ({
      isFeatureEnabled: (flag: string) => {
        if (flag === 'BSP_PROVIDER_META') return opts.meta ?? false;
        if (flag === 'BSP_PROVIDER_INTERAKT') return opts.interakt ?? false;
        return false;
      },
    }));
    const mod = await import('./provider.factory');
    return mod.resolveWhatsAppProviderName;
  }

  it('uses WHATSAPP_PROVIDER override when set', async () => {
    const resolve = await loadResolver({
      whatsappProvider: 'meta',
      meta: false,
      interakt: true,
    });
    expect(resolve()).toBe('meta');
  });

  it('selects Meta from feature flag', async () => {
    const resolve = await loadResolver({ meta: true, interakt: false });
    expect(resolve()).toBe('meta');
  });

  it('selects Interakt from feature flag', async () => {
    const resolve = await loadResolver({ meta: false, interakt: true });
    expect(resolve()).toBe('interakt');
  });

  it('prefers Meta when both flags are enabled', async () => {
    const resolve = await loadResolver({ meta: true, interakt: true });
    expect(resolve()).toBe('meta');
  });

  it('falls back to stub when no flag and no override', async () => {
    const resolve = await loadResolver({ meta: false, interakt: false });
    expect(resolve()).toBe('stub');
  });
});
