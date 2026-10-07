import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from '@/game/settings-store';
import { minimalReadout } from '@/hud/minimal-readout';
import type { HudState } from '@/types/hud';
import { DEFAULT_SETTINGS } from '@/types/session';
import { adjustSetting, SETTING_GROUPS, valueLabel } from '@/ui/settings-model';

const lap: HudState['lap'] = {
  number: 2, currentS: 124.903, lastS: 127.421, bestS: 125.314, deltaS: -0.411,
  valid: true, currentSector: 1, sectors: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('minimal HUD setting', () => {
  it('starts Full and offers Full/Minimal in Display without changing other settings', () => {
    expect(DEFAULT_SETTINGS.hudSize).toBe('full');
    const field = SETTING_GROUPS.find((group) => group.title === 'Display')?.fields.find((f) => f.key === 'hudSize');
    if (!field) throw new Error('HUD size setting missing from Display');
    const before = { ...DEFAULT_SETTINGS, motionBlur: false, steerTouch: 1.4, units: 'mph' as const };
    expect(valueLabel(field, before)).toBe('Full');
    const minimal = adjustSetting(before, field, 1);
    expect(minimal).toEqual({ ...before, hudSize: 'minimal' });
    expect(valueLabel(field, minimal)).toBe('Minimal');
    expect(adjustSetting(minimal, field, 1)).toEqual(before);
  });

  it('persists Minimal and gives older saved settings the Full default', () => {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    });
    saveSettings({ ...DEFAULT_SETTINGS, hudSize: 'minimal', motionBlur: false });
    expect(loadSettings()).toMatchObject({ hudSize: 'minimal', motionBlur: false });
    entries.set('bathurst.settings.v1', JSON.stringify({ units: 'mph', motionBlur: false }));
    expect(loadSettings()).toMatchObject({ hudSize: 'full', units: 'mph', motionBlur: false });
  });
});

describe('minimal instruments', () => {
  it('shows live speed, gear and current lap time, without the last/best/delta data', () => {
    expect(minimalReadout({ speedKmh: 187.4, units: 'kmh', gear: 4, lap })).toEqual({
      speed: '187', units: 'KM/H', gear: '4', lapTime: '2:04.903',
    });
  });

  it('keeps the selected units, reverse/neutral and a running out-lap time', () => {
    expect(minimalReadout({ speedKmh: -251, units: 'mph', gear: -1, lap })).toMatchObject({
      speed: '156', units: 'MPH', gear: 'R',
    });
    expect(minimalReadout({ speedKmh: 0, units: 'kmh', gear: 0, lap: { ...lap, number: 0, currentS: 0 } })).toMatchObject({
      speed: '0', gear: 'N', lapTime: '0:00.000',
    });
  });
});
