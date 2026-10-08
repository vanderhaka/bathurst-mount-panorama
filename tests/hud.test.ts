import { describe, expect, it } from 'vitest';
import {
  deltaBarFraction,
  deltaClass,
  displaySpeed,
  formatDelta,
  formatLapTime,
  formatSectorTime,
  gearLabel,
  kmhToMph,
  mphToKmh,
} from '@/hud/format';
import { damageMix, ledColourAt, peakPowerKw, sectorClass, sectorColourVar, SHIFT_LED_COUNT, shiftLightCount, shiftPhase } from '@/hud/indicators';
import { fitTransform, headingToCssDeg, nextCornerAfter, project } from '@/hud/map-geometry';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_SETTINGS } from '@/types/session';
import { keyboardRows, padLabels } from '@/ui/controls-data';
import { adjustSetting, ALL_FIELDS, valueLabel } from '@/ui/settings-model';

describe('lap time formatting', () => {
  it('formats m:ss.mmm, truncating to the millisecond', () => {
    expect(formatLapTime(65.4321)).toBe('1:05.432');
    expect(formatLapTime(124.903)).toBe('2:04.903');
    expect(formatLapTime(65.432)).toBe('1:05.432');
    expect(formatLapTime(0)).toBe('0:00.000');
    expect(formatLapTime(59.9999)).toBe('0:59.999');
  });

  it('shows a placeholder for missing times', () => {
    expect(formatLapTime(null)).toBe('-:--.---');
    expect(formatLapTime(Number.NaN)).toBe('-:--.---');
  });

  it('formats sector times without minutes under a minute', () => {
    expect(formatSectorTime(41.208)).toBe('41.208');
    expect(formatSectorTime(65)).toBe('1:05.000');
    expect(formatSectorTime(null)).toBe('--.---');
  });
});

describe('delta formatting', () => {
  it('always carries a sign and three decimals', () => {
    expect(formatDelta(0.312)).toBe('+0.312');
    expect(formatDelta(-1.205)).toBe('-1.205');
    expect(formatDelta(0)).toBe('+0.000');
    expect(formatDelta(-0.0001)).toBe('+0.000');
    expect(formatDelta(null)).toBe('--.---');
  });

  it('maps sign to a colour class (green faster, red slower)', () => {
    expect(deltaClass(-1.205)).toBe('faster');
    expect(deltaClass(0.312)).toBe('slower');
    expect(deltaClass(0)).toBe('even');
    expect(deltaClass(null)).toBe('none');
  });

  it('clamps the delta bar to +-1', () => {
    expect(deltaBarFraction(-0.75)).toBeCloseTo(-0.5);
    expect(deltaBarFraction(9)).toBe(1);
    expect(deltaBarFraction(null)).toBe(0);
  });
});

describe('units', () => {
  it('converts km/h and mph both ways', () => {
    expect(kmhToMph(100)).toBeCloseTo(62.1371, 3);
    expect(mphToKmh(62.1371)).toBeCloseTo(100, 2);
    expect(mphToKmh(kmhToMph(287))).toBeCloseTo(287, 9);
  });

  it('rounds display speed and never shows negatives', () => {
    expect(displaySpeed(251, 'mph')).toBe(156);
    expect(displaySpeed(187.4, 'kmh')).toBe(187);
    expect(displaySpeed(-12, 'kmh')).toBe(12);
  });

  it('labels gears', () => {
    expect(gearLabel(-1)).toBe('R');
    expect(gearLabel(0)).toBe('N');
    expect(gearLabel(4)).toBe('4');
  });
});

describe('shift lights', () => {
  const start = 5600;
  const shift = 7200;

  it('lights nothing below the start rpm and one LED at it', () => {
    expect(shiftLightCount(5599, start, shift)).toBe(0);
    expect(shiftLightCount(start, start, shift)).toBe(1);
  });

  it('fills linearly and lights the last LED only at the shift point', () => {
    expect(shiftLightCount(6400, start, shift)).toBe(8);
    expect(shiftLightCount(7199, start, shift)).toBe(SHIFT_LED_COUNT - 1);
    expect(shiftLightCount(shift, start, shift)).toBe(SHIFT_LED_COUNT);
    expect(shiftLightCount(7600, start, shift)).toBe(SHIFT_LED_COUNT);
  });

  it('colours the strip green, amber, red by thirds', () => {
    expect(ledColourAt(0)).toBe('green');
    expect(ledColourAt(4)).toBe('green');
    expect(ledColourAt(5)).toBe('amber');
    expect(ledColourAt(10)).toBe('red');
    expect(ledColourAt(14)).toBe('red');
  });

  it('reports the flash phases', () => {
    expect(shiftPhase(5000, start, shift, false)).toBe('off');
    expect(shiftPhase(6000, start, shift, false)).toBe('build');
    expect(shiftPhase(7300, start, shift, false)).toBe('shift');
    expect(shiftPhase(7500, start, shift, true)).toBe('limiter');
  });
});

describe('sector colours', () => {
  it('maps states to purple / green / yellow conventions', () => {
    expect(sectorClass('overallBest')).toBe('ob');
    expect(sectorClass('personalBest')).toBe('pb');
    expect(sectorClass('slower')).toBe('slow');
    expect(sectorClass('none')).toBe('none');
    expect(sectorColourVar('overallBest')).toBe('--hud-sector-overall');
    expect(sectorColourVar('slower')).toBe('--hud-sector-slower');
  });
});

describe('damage and power', () => {
  it('splits damage into two colour-mix weights', () => {
    expect(damageMix(0)).toEqual({ d1: 0, d2: 0, q: 0 });
    expect(damageMix(0.5)).toEqual({ d1: 1, d2: 0, q: 0.5 });
    expect(damageMix(1)).toEqual({ d1: 1, d2: 1, q: 1 });
    expect(damageMix(0.26).q).toBe(0.25);
  });

  it('finds peak power on the torque curve', () => {
    const p = peakPowerKw(CAR_SPECS.camaro.engine.torqueCurve);
    expect(p.kw).toBeGreaterThan(400);
    expect(p.kw).toBeLessThan(450);
  });
});

describe('track map geometry', () => {
  const square: Array<[number, number]> = [
    [-100, -100],
    [100, -100],
    [100, 100],
    [-100, 100],
  ];

  it('fits the outline into the box and projects north-up at rotation 0', () => {
    const t = fitTransform(square, 0, 220, 220, 10);
    expect(project(t, -100, -100, [0, 0])).toEqual([10, 10]);
    expect(project(t, 100, 100, [0, 0])).toEqual([210, 210]);
  });

  it('turns world heading into a CSS rotation', () => {
    const t = fitTransform(square, 0, 220, 220, 10);
    expect(headingToCssDeg(t, 0)).toBeCloseTo(180); // +Z = south = screen down
    expect(headingToCssDeg(t, Math.PI / 2)).toBeCloseTo(90); // +X = east = screen right
  });

  it('finds the next corner and wraps after the last one', () => {
    const corners = [
      { progress: 0.07, name: 'Hell Corner', turn: 1 },
      { progress: 0.99, name: "Murray's Corner", turn: 23 },
    ];
    expect(nextCornerAfter(corners, 0.5)?.turn).toBe(23);
    expect(nextCornerAfter(corners, 0.995)?.turn).toBe(1);
  });
});

describe('menu models', () => {
  it('cycles choices and clamps volume', () => {
    const line = ALL_FIELDS.find((f) => f.key === 'racingLine');
    const vol = ALL_FIELDS.find((f) => f.key === 'masterVolume');
    if (!line || !vol) throw new Error('missing fields');
    expect(adjustSetting(DEFAULT_SETTINGS, line, 1).racingLine).toBe('full');
    expect(adjustSetting({ ...DEFAULT_SETTINGS, racingLine: 'full' }, line, 1).racingLine).toBe('off');
    expect(adjustSetting({ ...DEFAULT_SETTINGS, masterVolume: 1 }, vol, 1).masterVolume).toBe(1);
    expect(valueLabel(vol, DEFAULT_SETTINGS)).toBe('80%');
  });

  it('steps steering sensitivity in 10 % steps between 50 % and 200 %', () => {
    const pad = ALL_FIELDS.find((f) => f.key === 'steerPad');
    if (!pad) throw new Error('missing steerPad');
    expect(valueLabel(pad, DEFAULT_SETTINGS)).toBe('100%');
    expect(adjustSetting(DEFAULT_SETTINGS, pad, 1).steerPad).toBe(1.1);
    expect(adjustSetting({ ...DEFAULT_SETTINGS, steerPad: 2 }, pad, 1).steerPad).toBe(2);
    expect(adjustSetting({ ...DEFAULT_SETTINGS, steerPad: 0.5 }, pad, -1).steerPad).toBe(0.5);
    let s = DEFAULT_SETTINGS;
    for (let i = 0; i < 7; i++) s = adjustSetting(s, pad, 1);
    expect(s.steerPad).toBe(1.7); // no float drift
  });

  it('covers every Settings field', () => {
    // steerOnboarded is first-run bookkeeping (the steering question was answered), not an option.
    const options = Object.keys(DEFAULT_SETTINGS).filter((key) => key !== 'steerOnboarded');
    expect(new Set(ALL_FIELDS.map((f) => f.key))).toEqual(new Set(options));
  });

  it('builds the controls help from the shared bindings', () => {
    const steer = keyboardRows().find((r) => r.label === 'Steer');
    expect(steer?.keys).toEqual([
      ['←', '→'],
      ['A', 'D'],
    ]);
    expect(padLabels().get('RT')).toBe('Throttle');
    expect(padLabels().get('Left stick')).toBe('Steer');
  });
});
