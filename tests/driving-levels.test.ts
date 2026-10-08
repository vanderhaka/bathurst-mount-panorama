import { describe, expect, it } from 'vitest';
import { applyLevel, EXPERIENCED_CHOICES, LEVEL_PRESETS, LEVELS, lapLevel, levelChoice, levelRank } from '@/race/driving-levels';
import { DEFAULT_SETTINGS, type Settings } from '@/types/session';

const at = (level: keyof typeof LEVEL_PRESETS, extra: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...LEVEL_PRESETS[level], ...extra });

describe('levels', () => {
  it('orders Casual, Experienced, Superstar from least to most strict', () => {
    expect(LEVELS).toEqual(['casual', 'experienced', 'superstar']);
    expect(levelRank('casual')).toBeLessThan(levelRank('experienced'));
    expect(levelRank('experienced')).toBeLessThan(levelRank('superstar'));
  });

  it('recognises each preset as its own card and records it on its own level', () => {
    for (const level of LEVELS) {
      expect(levelChoice(at(level))).toBe(level);
      expect(lapLevel(at(level))).toBe(level);
    }
  });

  it('makes the defaults an Experienced player, so the old records belong to Experienced', () => {
    expect(levelChoice(DEFAULT_SETTINGS)).toBe('experienced');
    expect(lapLevel(DEFAULT_SETTINGS)).toBe('experienced');
  });

  it('keeps every allowed Experienced choice on the Experienced card and level', () => {
    for (const racingLine of EXPERIENCED_CHOICES.racingLine) for (const autoGears of EXPERIENCED_CHOICES.autoGears) for (const damage of EXPERIENCED_CHOICES.damage) {
      const s = at('experienced', { racingLine, autoGears, damage });
      expect(levelChoice(s)).toBe('experienced');
      expect(lapLevel(s)).toBe('experienced');
    }
  });
});

describe('Custom and the level a lap counts for', () => {
  it('counts a Superstar setup with ABS on as Experienced, on the Custom card', () => {
    const s = at('superstar', { abs: true });
    expect(levelChoice(s)).toBe('custom');
    expect(lapLevel(s)).toBe('experienced');
  });

  it('drops a lap to Casual for any Casual-only help', () => {
    for (const extra of [{ trackLimits: false }, { wear: false }, { autoRecover: true }, { damage: 'off' as const }, { racingLine: 'full' as const }]) {
      expect(lapLevel(at('superstar', extra))).toBe('casual');
      expect(lapLevel(at('experienced', extra))).toBe('casual');
    }
  });

  it('counts Casual with track limits back on as Casual (the full racing line is still there)', () => {
    expect(lapLevel(at('casual', { trackLimits: true }))).toBe('casual');
    expect(levelChoice(at('casual', { trackLimits: true }))).toBe('custom');
  });
});

describe('applyLevel', () => {
  it('sets every rule of the level and nothing else', () => {
    const s = applyLevel({ ...DEFAULT_SETTINGS, units: 'mph', camera: 'cockpit' }, 'superstar');
    expect(s).toMatchObject({ ...LEVEL_PRESETS.superstar, units: 'mph', camera: 'cockpit' });
  });

  it('keeps an Experienced player\'s own choices, and gives Experienced defaults to anyone else', () => {
    const mine = at('experienced', { racingLine: 'off', autoGears: false, damage: 'full' });
    expect(applyLevel(mine, 'experienced')).toBe(mine);
    expect(applyLevel(at('casual'), 'experienced')).toMatchObject(LEVEL_PRESETS.experienced);
  });
});
