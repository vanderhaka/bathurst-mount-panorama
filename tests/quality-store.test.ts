import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadQualityChoice, qualityFromSettings, saveQualityChoice } from '@/game/quality-store';
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

const KEY = 'bathurst.quality.v3';
const auto = { quality: 'high', autoQuality: true } as const;
const savedSettings = (values: object) => data.set('bathurst.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, ...values }));

describe('saved graphics result', () => {
  it('restores both the automatic tier and DPR after reloading Settings', () => {
    saveQualityChoice({ quality: 'low', pixelRatio: 0.75, automatic: true });
    expect(loadQualityChoice(auto)).toEqual({ quality: 'low', pixelRatio: 0.75, automatic: true });
    expect(loadSettings()).toMatchObject({ quality: 'low', autoQuality: true });
  });

  it('keeps a manual choice across browser updates, desktop zoom and orientation', () => {
    saveQualityChoice({ quality: 'medium', pixelRatio: 1.5, automatic: false });
    vi.stubGlobal('navigator', { userAgent: 'test-device, one version later' });
    vi.stubGlobal('window', { devicePixelRatio: 2.2 });
    vi.stubGlobal('screen', { width: 844, height: 390 });
    expect(loadQualityChoice(auto)).toEqual({ quality: 'medium', pixelRatio: 1.5, automatic: false });
    expect(loadSettings()).toMatchObject({ quality: 'medium', autoQuality: false });
  });

  it('keeps a learned density but lets tier defaults follow the current display', () => {
    saveQualityChoice({ quality: 'high', pixelRatio: 1, automatic: true });
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    saveQualityChoice({ quality: 'medium', pixelRatio: 1, automatic: false });
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    expect(loadQualityChoice(auto)).toEqual({ quality: 'medium', pixelRatio: 1.5, automatic: false });
    saveQualityChoice({ quality: 'low', pixelRatio: 0.75, automatic: true });
    vi.stubGlobal('window', { devicePixelRatio: 1.25 });
    expect(loadQualityChoice(auto)).toEqual({ quality: 'low', pixelRatio: 0.75, automatic: true });
  });

  it('starts on High when a quality was saved only with Settings', () => {
    savedSettings({ quality: 'medium', autoQuality: false });
    expect(loadSettings()).toMatchObject({ quality: 'high', autoQuality: false });
    expect(loadQualityChoice(loadSettings())).toEqual({ quality: 'high', pixelRatio: 2, automatic: false });
  });

  it('starts on High instead of restoring results saved by older versions', () => {
    savedSettings({ quality: 'low', autoQuality: true });
    data.set(`bathurst.quality.v1.${JSON.stringify(['test-device', [390, 844], 3, false])}`, JSON.stringify({ quality: 'low', pixelRatio: 0.75, automatic: true }));
    data.set('bathurst.quality.v2', JSON.stringify({ quality: 'medium', pixelRatio: null, automatic: false }));
    expect(loadSettings()).toMatchObject({ quality: 'high', autoQuality: false });
    expect(loadQualityChoice(loadSettings())).toEqual({ quality: 'high', pixelRatio: 2, automatic: false });
  });

  it('starts a phone on High with automatic quality off, like a desktop', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(loadSettings()).toMatchObject({ quality: 'high', autoQuality: false });
    expect(loadQualityChoice(loadSettings())).toEqual({ quality: 'high', pixelRatio: 2, automatic: false });
  });

  it('recovers from malformed saved data and unavailable storage', () => {
    data.set(KEY, JSON.stringify({ quality: 'ultra', pixelRatio: -1, automatic: true }));
    expect(loadQualityChoice({ quality: 'medium', autoQuality: true })).toEqual({ quality: 'medium', pixelRatio: 1.5, automatic: true });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(() => saveQualityChoice({ quality: 'low', pixelRatio: 0.5, automatic: true })).not.toThrow();
    expect(loadQualityChoice(auto).quality).toBe('high');
    expect(loadSettings()).toMatchObject({ quality: 'high', autoQuality: false });
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
    expect(qualityFromSettings({ ...DEFAULT_SETTINGS, quality: 'low', autoQuality: true, masterVolume: 0.3 }, { quality: 'low', pixelRatio: 0.75, automatic: true })).toEqual({ quality: 'low', pixelRatio: 0.75, automatic: true });
  });

  it('applies an explicit learned density to the actual renderer', () => {
    const setPixelRatio = vi.fn();
    setRendererQuality({ setPixelRatio } as unknown as THREE.WebGLRenderer, 'low', 0.75);
    expect(setPixelRatio).toHaveBeenCalledWith(0.75);
  });
});
