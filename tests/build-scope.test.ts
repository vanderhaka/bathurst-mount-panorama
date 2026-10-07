import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vite';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('deployment build scope', () => {
  it.each([
    ['production', ['main'], false],
    ['preview', ['main', 'cars', 'props', 'hud', 'audio', 'track'], true],
    [undefined, ['main', 'cars', 'props', 'hud', 'audio', 'track'], true],
  ] as const)('keeps the right inputs and dev tools for VERCEL_ENV=%s', async (environment, inputs, devTools) => {
    vi.stubEnv('VERCEL_ENV', environment);
    vi.resetModules();
    const config = (await import('../vite.config')).default as UserConfig;
    expect(Object.keys(config.build!.rollupOptions!.input!)).toEqual(inputs);
    expect(config.define!.__DEV_TOOLS__).toBe(JSON.stringify(devTools));
  });
});
