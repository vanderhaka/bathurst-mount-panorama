import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceQualityKey, loadQualityChoice, qualityFromSettings, saveQualityChoice } from '@/game/quality-store';
import { loadSettings } from '@/game/settings-store';
import { DEFAULT_SETTINGS } from '@/types/session';
import { adjustSetting, ALL_FIELDS } from '@/ui/settings-model';
import { setRendererQuality } from '@/render/renderer';
import type * as THREE from 'three';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
  vi.stubGlobal('window', { devicePixelRatio: 3 });
  vi.stubGlobal('screen', { width: 390, height: 844 });
  vi.stubGlobal('navigator', { userAgent: 'test-device' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe('per-device graphics result', () => {
  it('restores both the automatic tier and DPR after reloading Settings', () => {
    saveQualityChoice({ quality: 'low', pixelRatio: 0.75, automatic: true });
    expect(loadQualityChoice('high')).toEqual({ quality: 'low', pixelRatio: 0.75, automatic: true });
    expect(loadSettings()).toMatchObject({ quality: 'low', autoQuality: true });
  });

  it('is stable across device orientation but separate for another device', () => {
    const key = deviceQualityKey();
    saveQualityChoice({ quality: 'low', pixelRatio: 0.5, automatic: true });
    vi.stubGlobal('screen', { width: 844, height: 390 });
    expect(deviceQualityKey()).toBe(key);
    vi.stubGlobal('navigator', { userAgent: 'another-device' });
    expect(loadQualityChoice('high')).toEqual({ quality: 'high', pixelRatio: 2, automatic: true });
  });

  it('discards automatic results saved by the old monitor but keeps manual choices', () => {
    const legacy = deviceQualityKey().replace('.v2.', '.v1.');
    data.set(legacy, JSON.stringify({ quality: 'low', pixelRatio: 0.75, automatic: true }));
    expect(loadQualityChoice('high')).toEqual({ quality: 'high', pixelRatio: 2, automatic: true });
    expect(loadSettings()).toMatchObject({ quality: 'high', autoQuality: true });
    data.set(legacy, JSON.stringify({ quality: 'medium', pixelRatio: 1.5, automatic: false }));
    expect(loadQualityChoice('high')).toEqual({ quality: 'medium', pixelRatio: 1.5, automatic: false });
    saveQualityChoice({ quality: 'low', pixelRatio: 1, automatic: true });
    expect(loadQualityChoice('high')).toEqual({ quality: 'low', pixelRatio: 1, automatic: true });
  });

  it('recovers from malformed saved data and unavailable storage', () => {
    data.set(deviceQualityKey(), JSON.stringify({ quality: 'ultra', pixelRatio: -1, automatic: true }));
    expect(loadQualityChoice('medium')).toEqual({ quality: 'medium', pixelRatio: 1.5, automatic: true });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(() => saveQualityChoice({ quality: 'low', pixelRatio: 0.5, automatic: true })).not.toThrow();
    expect(loadQualityChoice('high').quality).toBe('high');
  });

  it('choosing Graphics quality explicitly disables automatic changes and restores tier density', () => {
    const field = ALL_FIELDS.find((f) => f.key === 'quality')!;
    const settings = adjustSetting({ ...DEFAULT_SETTINGS, quality: 'medium' }, field, 1);
    expect(settings).toMatchObject({ quality: 'high', autoQuality: false });
    const choice = qualityFromSettings(settings, { quality: 'low', pixelRatio: 0.5, automatic: true });
    expect(choice).toEqual({ quality: 'high', pixelRatio: 2, automatic: false });
    saveQualityChoice(choice);
    expect(loadSettings()).toMatchObject({ quality: 'high', autoQuality: false });
  });

  it('other Settings changes retain the learned density and automatic policy', () => {
    expect(qualityFromSettings({ ...DEFAULT_SETTINGS, quality: 'low', masterVolume: 0.3 }, { quality: 'low', pixelRatio: 0.75, automatic: true })).toEqual({ quality: 'low', pixelRatio: 0.75, automatic: true });
  });

  it('applies an explicit learned density to the actual renderer', () => {
    const setPixelRatio = vi.fn();
    setRendererQuality({ setPixelRatio } as unknown as THREE.WebGLRenderer, 'low', 0.75);
    expect(setPixelRatio).toHaveBeenCalledWith(0.75);
  });
});
