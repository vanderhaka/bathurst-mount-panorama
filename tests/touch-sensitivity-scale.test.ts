import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, rescaledTouchSensitivity } from '@/game/settings-store';
import { TOUCH_STEER_SCALE } from '@/input/touch-model';
import { DEFAULT_SETTINGS } from '@/types/session';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
  vi.stubGlobal('window', { devicePixelRatio: 2 });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

const save = (steerTouch: number) => data.set('bathurst.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, steerTouch }));

describe('touch sensitivity: the old 0.6 is the new 100 %', () => {
  it('steers at 0.6 of the old rate for the default setting', () => {
    expect(TOUCH_STEER_SCALE).toBe(0.6);
    expect(DEFAULT_SETTINGS.steerTouch).toBe(1);
  });

  it('keeps the feel of a tuned saved value and moves the untouched old default to the new default', () => {
    expect(rescaledTouchSensitivity(0.6)).toBe(1);
    expect(rescaledTouchSensitivity(0.9)).toBe(1.5);
    expect(rescaledTouchSensitivity(1)).toBe(1);
    expect(rescaledTouchSensitivity(2)).toBe(2);
    expect(rescaledTouchSensitivity(0.5)).toBe(0.8);
  });

  it('converts a saved value once, then leaves later changes alone', () => {
    save(0.6);
    expect(loadSettings().steerTouch).toBe(1);
    expect(loadSettings().steerTouch).toBe(1);
    save(0.7);
    expect(loadSettings().steerTouch).toBe(0.7);
  });

  it('starts a new player on the new default without converting it', () => {
    expect(loadSettings().steerTouch).toBe(1);
    save(0.6);
    expect(loadSettings().steerTouch).toBe(0.6);
  });
});
