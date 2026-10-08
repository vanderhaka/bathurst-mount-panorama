import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from '@/game/settings-store';
import { InputManager } from '@/input/input-manager';
import { touchControlsAvailable } from '@/input/touch-capability';
import type { TouchControls } from '@/input/touch-controls';
import { steerOnboarded } from '@/input/touch-model';
import { DEFAULT_SETTINGS } from '@/types/session';
import { SETTING_GROUPS } from '@/ui/settings-model';
import { STEER_LATER, needsSteerOnboarding, tiltFallbackNote, withSteerChoice } from '@/ui/steer-onboarding-model';

afterEach(() => vi.unstubAllGlobals());

/** localStorage stand-in holding one raw settings string (null = nothing saved). */
function storage(saved: object | null): () => string | null {
  let raw: string | null = saved === null ? null : JSON.stringify(saved);
  vi.stubGlobal('localStorage', { getItem: () => raw, setItem: (_k: string, v: string) => { raw = v; } });
  return () => raw;
}

describe('who is asked how to steer', () => {
  it('asks a touch device that has not chosen yet, and never a desktop', () => {
    expect(needsSteerOnboarding(DEFAULT_SETTINGS, true)).toBe(true);
    expect(needsSteerOnboarding(DEFAULT_SETTINGS, false)).toBe(false);
  });

  it('never asks again after a choice', () => {
    expect(needsSteerOnboarding({ ...DEFAULT_SETTINGS, steerOnboarded: true }, true)).toBe(false);
    for (const mode of ['drag', 'tilt'] as const) {
      expect(needsSteerOnboarding(withSteerChoice(DEFAULT_SETTINGS, mode), true)).toBe(false);
    }
  });

  it('counts a touch mode already changed away from the default as chosen', () => {
    for (const touchMode of ['tilt', 'buttons'] as const) {
      expect(needsSteerOnboarding({ ...DEFAULT_SETTINGS, touchMode }, true)).toBe(false);
    }
    expect(steerOnboarded({ touchMode: 'tilt' })).toBe(true);
  });

  it('treats a malformed flag or mode as not chosen', () => {
    for (const bad of ['yes', 1, null, {}]) expect(steerOnboarded({ steerOnboarded: bad })).toBe(false);
    expect(steerOnboarded({ touchMode: 'broken' })).toBe(false);
    expect(steerOnboarded({})).toBe(false);
  });
});

describe('detecting a touch screen', () => {
  it('is the same test the game uses to show the touch controls', () => {
    vi.stubGlobal('navigator', { maxTouchPoints: 5 });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(touchControlsAvailable()).toBe(true);
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }));
    expect(touchControlsAvailable()).toBe(true); // WebKit can hide maxTouchPoints
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(touchControlsAvailable()).toBe(false);
  });
});

describe('the choice', () => {
  it('saves Finger as drag and Tilt as tilt, both marked as chosen, and keeps everything else', () => {
    const before = { ...DEFAULT_SETTINGS, units: 'mph' as const, steerTouch: 1.4 };
    expect(withSteerChoice(before, 'drag')).toEqual({ ...before, touchMode: 'drag', steerOnboarded: true });
    expect(withSteerChoice(before, 'tilt')).toEqual({ ...before, touchMode: 'tilt', steerOnboarded: true });
  });

  it('explains a refused or missing sensor in one short line that names the Settings path', () => {
    expect(tiltFallbackNote('granted')).toBeNull();
    expect(tiltFallbackNote('denied')).toBe('Motion access is off — using Finger. Change it in Settings > Steering.');
    expect(tiltFallbackNote('unavailable')).toBe('Tilt is not available on this device — using Finger. Change it in Settings > Steering.');
  });

  it('points at a real menu path: Settings > Steering holds Touch steering mode', () => {
    expect(STEER_LATER).toBe('You can change this later in Settings > Steering.');
    const group = SETTING_GROUPS.find((g) => g.title === 'Steering');
    expect(group?.fields.some((f) => f.key === 'touchMode' && f.label === 'Touch steering mode')).toBe(true);
  });
});

describe('saved settings', () => {
  it('loads an old save without the flag as not chosen', () => {
    storage({ units: 'mph', steerTouch: 1.3 });
    const s = loadSettings();
    expect(s.steerOnboarded).toBe(false);
    expect(s.touchMode).toBe('drag');
    expect(needsSteerOnboarding(s, true)).toBe(true);
    expect(needsSteerOnboarding(s, false)).toBe(false);
  });

  it('loads a fresh device (nothing saved) as not chosen', () => {
    storage(null);
    expect(loadSettings().steerOnboarded).toBe(false);
  });

  it('loads an old save with a non-default touch mode as chosen, so that player is not asked', () => {
    for (const touchMode of ['tilt', 'buttons']) {
      storage({ touchMode });
      const s = loadSettings();
      expect(s.steerOnboarded).toBe(true);
      expect(needsSteerOnboarding(s, true)).toBe(false);
    }
  });

  it('ignores a malformed flag', () => {
    storage({ steerOnboarded: 'yes', touchMode: 'drag' });
    expect(loadSettings().steerOnboarded).toBe(false);
  });

  it('keeps the choice across a reload, and never asks twice', () => {
    const raw = storage({ units: 'mph' });
    saveSettings(withSteerChoice(loadSettings(), 'drag'));
    expect(JSON.parse(raw()!)).toMatchObject({ steerOnboarded: true, touchMode: 'drag', units: 'mph' });
    const reloaded = loadSettings();
    expect(reloaded.steerOnboarded).toBe(true);
    expect(needsSteerOnboarding(reloaded, true)).toBe(false);
  });

  it('loads defaults when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadSettings().steerOnboarded).toBe(false);
    expect(() => saveSettings(withSteerChoice(DEFAULT_SETTINGS, 'drag'))).not.toThrow();
  });
});

describe('the sensor request path', () => {
  it('goes from the input manager to the touch controls, and is unavailable without them', async () => {
    const input = new InputManager(new EventTarget() as Window);
    expect(await input.enableTilt()).toBe('unavailable');
    const enableTilt = vi.fn(() => Promise.resolve('granted' as const));
    input.attachTouch({ touched: false, onAction: () => {}, sensitivity: 1, configure: () => {}, enableTilt } as unknown as TouchControls);
    const pending = input.enableTilt();
    expect(enableTilt).toHaveBeenCalledTimes(1); // called before any microtask: still inside the tap
    expect(await pending).toBe('granted');
    input.dispose();
  });
});
