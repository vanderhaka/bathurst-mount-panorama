import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings } from '@/game/settings-store';
import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { LEVEL_PRESETS, levelChoice } from '@/race/driving-levels';
import {
  CUSTOM_ROWS, detailRows, EXPERIENCED_ROWS, lapLevelLine, LEVEL_CARDS, LEVEL_FACTS, LEVEL_RECORDS_NOTE, needsOnboarding, ONBOARDING_LATER, ONBOARDING_ROWS,
  rowHelp, rowIndex, rowValue, rowValueLabel, rowWhere, selectLevel, stepRow, TOUCH_ROWS, withOnboarded, type OnboardingRow,
} from '@/ui/onboarding-model';
import { SETTING_GROUPS } from '@/ui/settings-model';

afterEach(() => vi.unstubAllGlobals());

const row = (key: OnboardingRow['key']): OnboardingRow => ONBOARDING_ROWS.find((r) => r.key === key)!;
const custom: Settings = { ...DEFAULT_SETTINGS, abs: false };
const LEVEL_PRESETS_SETTINGS: Settings = { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS.experienced };

describe('level cards', () => {
  it('has facts for all four cards, at most three each', () => {
    expect(LEVEL_CARDS).toEqual(['casual', 'experienced', 'superstar', 'custom']);
    for (const c of LEVEL_CARDS) {
      expect(LEVEL_FACTS[c].length).toBeGreaterThan(0);
      expect(LEVEL_FACTS[c].length).toBeLessThanOrEqual(3);
    }
  });

  it('applies a level on select, and keeps the rules on Custom', () => {
    expect(selectLevel(DEFAULT_SETTINGS, 'casual')).toMatchObject(LEVEL_PRESETS.casual);
    expect(selectLevel(DEFAULT_SETTINGS, 'superstar')).toMatchObject(LEVEL_PRESETS.superstar);
    expect(selectLevel(custom, 'custom')).toBe(custom);
  });

  it('shows the defaults as Experienced and no rows for Casual or Superstar', () => {
    expect(levelChoice(DEFAULT_SETTINGS)).toBe('experienced');
    expect(detailRows('casual')).toEqual([]);
    expect(detailRows('superstar')).toEqual([]);
  });

  it('cycles Experienced rows through the allowed values only', () => {
    expect(EXPERIENCED_ROWS.map((r) => r.key)).toEqual(['racingLine', 'autoGears', 'damage']);
    const [line, gears, damage] = EXPERIENCED_ROWS;
    expect(line.options.map((o) => o.value)).toEqual(['braking', 'off']);
    expect(gears.options.map((o) => o.value)).toEqual([true, false]);
    expect(damage.options.map((o) => o.value)).toEqual(['visual', 'full']);
    let s = stepRow(LEVEL_PRESETS_SETTINGS, line, 1);
    expect(s.racingLine).toBe('off');
    s = stepRow(s, line, 1);
    expect(s.racingLine).toBe('braking');
    expect(stepRow(LEVEL_PRESETS_SETTINGS, damage, 1).damage).toBe('full');
    expect(stepRow(LEVEL_PRESETS_SETTINGS, gears, -1).autoGears).toBe(false);
    expect(levelChoice(stepRow(LEVEL_PRESETS_SETTINGS, line, 1))).toBe('experienced');
  });

  it('shows the nine Driving assists choice fields on Custom, with every option', () => {
    const group = SETTING_GROUPS.find((g) => g.title === 'Driving assists')!;
    const fields = group.fields.filter((f) => f.kind === 'choice');
    expect(fields).toHaveLength(9);
    expect(CUSTOM_ROWS.map((r) => r.key)).toEqual(fields.map((f) => f.key));
    expect(CUSTOM_ROWS.map((r) => r.label)).toEqual(fields.map((f) => f.label));
    expect(detailRows('custom')).toBe(CUSTOM_ROWS);
    expect(CUSTOM_ROWS.find((r) => r.key === 'damage')!.options).toHaveLength(3);
    expect(rowWhere(CUSTOM_ROWS[0])).toBe('Settings > Driving assists');
  });

  it('words the live lap level line from the rules', () => {
    expect(lapLevelLine(selectLevel(DEFAULT_SETTINGS, 'superstar'))).toBe('Your laps count as: Superstar');
    expect(lapLevelLine({ ...selectLevel(DEFAULT_SETTINGS, 'superstar'), abs: true })).toBe('Your laps count as: Experienced');
    expect(lapLevelLine(selectLevel(DEFAULT_SETTINGS, 'casual'))).toBe('Your laps count as: Casual');
    expect(LEVEL_RECORDS_NOTE).toBe('Each level keeps its own best laps and ghost.');
  });
});

describe('camera rows', () => {
  it('names a Settings tab that exists', () => {
    for (const r of [...ONBOARDING_ROWS, ...CUSTOM_ROWS, ...EXPERIENCED_ROWS, ...TOUCH_ROWS]) {
      expect(SETTING_GROUPS.some((g) => g.title === r.settingsTab)).toBe(true);
      expect(rowWhere(r)).toBe(`Settings > ${r.settingsTab}`);
    }
  });

  it('shows a camera that is not offered by its Settings label and steps into the offered three', () => {
    const tv = { ...DEFAULT_SETTINGS, camera: 'tv' as const };
    expect(rowIndex(row('camera'), tv)).toBe(-1);
    expect(rowValueLabel(row('camera'), tv)).toBe('TV');
    expect(rowValueLabel(row('camera'), { ...tv, camera: 'chaseFar' })).toBe('Chase far');
    expect(stepRow(tv, row('camera'), 1).camera).toBe('chase');
    expect(stepRow(tv, row('camera'), -1).camera).toBe('cockpit');
  });

  it('tells the player how to change the camera while driving', () => {
    for (const o of row('camera').options) expect(o.help).toContain('{RB}');
    expect(rowHelp(row('camera'), { ...DEFAULT_SETTINGS, camera: 'tv' })).toContain('{RB}');
  });
});

describe('touch pedal rows', () => {
  const pedals = TOUCH_ROWS.find((r) => r.key === 'pedals')!;
  const auto = TOUCH_ROWS.find((r) => r.key === 'touchAutoThrottle')!;

  it('sets analog throttle and brake together, and shows a Settings mix as Mixed', () => {
    expect(rowValueLabel(pedals, DEFAULT_SETTINGS)).toBe('On/off');
    const analog = stepRow(DEFAULT_SETTINGS, pedals, 1);
    expect(analog).toMatchObject({ touchAnalogThrottle: true, touchAnalogBrake: true });
    expect(rowValueLabel(pedals, analog)).toBe('Analog');
    expect(stepRow(analog, pedals, 1)).toMatchObject({ touchAnalogThrottle: false, touchAnalogBrake: false });
    const mixed = { ...DEFAULT_SETTINGS, touchAnalogThrottle: true };
    expect(rowIndex(pedals, mixed)).toBe(-1);
    expect(rowValueLabel(pedals, mixed)).toBe('Mixed');
    expect(rowHelp(pedals, mixed)).toContain('Settings');
    expect(stepRow(mixed, pedals, 1)).toMatchObject({ touchAnalogThrottle: false, touchAnalogBrake: false });
  });

  it('turns auto-throttle off and on', () => {
    expect(rowValueLabel(auto, DEFAULT_SETTINGS)).toBe('Off');
    expect(stepRow(DEFAULT_SETTINGS, auto, 1).touchAutoThrottle).toBe(true);
    expect(rowWhere(auto)).toBe('Settings > Steering');
  });
});

describe('graphics row', () => {
  const auto = { ...DEFAULT_SETTINGS, quality: 'high' as const, autoQuality: true };

  it('shows Auto by default, or the tier the player chose, with the Settings tier labels', () => {
    expect(rowValue(row('graphics'), DEFAULT_SETTINGS)).toBe('auto');
    expect(rowValueLabel(row('graphics'), DEFAULT_SETTINGS)).toBe('Auto');
    expect(rowValueLabel(row('graphics'), { ...DEFAULT_SETTINGS, autoQuality: false })).toBe('High');
    expect(rowValueLabel(row('graphics'), { ...DEFAULT_SETTINGS, quality: 'medium', autoQuality: false })).toBe('Medium');
    const field = SETTING_GROUPS.flatMap((g) => g.fields).find((f) => f.key === 'quality');
    expect(field?.kind === 'choice' && field.options.map((o) => o.label)).toEqual(row('graphics').options.slice(1).map((o) => o.label));
  });

  it('keeps a learned automatic tier until the player moves the row', () => {
    const learned = { ...DEFAULT_SETTINGS, quality: 'medium' as const, autoQuality: true };
    expect(rowValue(row('graphics'), learned)).toBe('auto');
    expect(rowHelp(row('graphics'), learned)).toContain('Starts on High');
  });

  it('turns automatic quality off for a tier, and restarts Auto from High', () => {
    const low = stepRow(auto, row('graphics'), 1);
    expect(low).toMatchObject({ quality: 'low', autoQuality: false });
    const back = stepRow(low, row('graphics'), -1);
    expect(back).toMatchObject({ quality: 'high', autoQuality: true });
    const high = stepRow(auto, row('graphics'), -1);
    expect(high).toMatchObject({ quality: 'high', autoQuality: false });
    expect(stepRow(DEFAULT_SETTINGS, row('graphics'), -1)).toMatchObject({ quality: 'high', autoQuality: false });
    expect(rowValue(row('graphics'), stepRow({ ...DEFAULT_SETTINGS, autoQuality: false }, row('graphics'), 1))).toBe('auto');
  });
});

describe('who sees the screen', () => {
  it('shows it until the choices are saved, and says everything can be changed later', () => {
    expect(needsOnboarding(DEFAULT_SETTINGS)).toBe(true);
    expect(needsOnboarding(withOnboarded(DEFAULT_SETTINGS))).toBe(false);
    expect(ONBOARDING_LATER).toContain('Settings');
  });
});

describe('saved settings', () => {
  const storage = (saved: object | null): void => {
    vi.stubGlobal('localStorage', { getItem: () => (saved === null ? null : JSON.stringify(saved)), setItem: () => {} });
  };

  it('loads an old save without the flag as not onboarded, keeping its own values', () => {
    storage({ damage: 'off', racingLine: 'full' });
    const s = loadSettings();
    expect(s.onboarded).toBe(false);
    expect(s).toMatchObject({ damage: 'off', racingLine: 'full' });
  });

  it('loads a stored flag, and ignores a malformed one', () => {
    storage({ onboarded: true });
    expect(loadSettings().onboarded).toBe(true);
    storage({ onboarded: 'yes' });
    expect(loadSettings().onboarded).toBe(false);
  });
});
