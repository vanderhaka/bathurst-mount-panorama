import { describe, expect, it } from 'vitest';
import { LEVEL_PRESETS, RULE_KEYS } from '@/race/driving-levels';
import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { adjustSetting, levelIndex, SETTING_GROUPS, valueLabel } from '@/ui/settings-model';

const assists = SETTING_GROUPS.find((g) => g.title === 'Driving assists')!;
const level = assists.fields[0];
const row = (key: string) => assists.fields.find((f) => f.key === key)!;
const rules = (s: Settings) => Object.fromEntries(RULE_KEYS.map((k) => [k, s[k]]));

describe('Driving level row', () => {
  it('is first in Driving assists and reads Experienced by default', () => {
    expect(level.key).toBe('drivingLevel');
    expect(level.kind).toBe('level');
    expect(valueLabel(level, DEFAULT_SETTINGS)).toBe('Experienced');
    expect(levelIndex(DEFAULT_SETTINGS)).toBe(1);
  });

  it('steps through the levels and wraps', () => {
    const sup = adjustSetting(DEFAULT_SETTINGS, level, 1);
    expect(rules(sup)).toEqual(LEVEL_PRESETS.superstar);
    expect(rules(adjustSetting(sup, level, 1))).toEqual(LEVEL_PRESETS.casual);
    expect(rules(adjustSetting(DEFAULT_SETTINGS, level, -1))).toEqual(LEVEL_PRESETS.casual);
  });

  it('shows Custom for a mix, with no pip, and leaves it to Casual or Superstar', () => {
    const custom = { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS.superstar, abs: true };
    expect(valueLabel(level, custom)).toBe('Custom');
    expect(levelIndex(custom)).toBe(-1);
    expect(rules(adjustSetting(custom, level, 1))).toEqual(LEVEL_PRESETS.casual);
    expect(rules(adjustSetting(custom, level, -1))).toEqual(LEVEL_PRESETS.superstar);
  });

  it('turns Custom when a rule row changes', () => {
    const sup = { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS.superstar };
    expect(valueLabel(level, sup)).toBe('Superstar');
    expect(valueLabel(level, adjustSetting(sup, row('abs'), 1))).toBe('Custom');
  });
});
