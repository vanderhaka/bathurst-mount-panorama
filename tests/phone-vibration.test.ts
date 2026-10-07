import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneVibration } from '@/input/phone-vibration';
import { DEFAULT_SETTINGS } from '@/types/session';
import { adjustSetting, ALL_FIELDS, valueLabel } from '@/ui/settings-model';

function harness() {
  let time = 0;
  const pulses: number[] = [];
  const vibration = new PhoneVibration((ms) => { pulses.push(ms); return true; }, () => time);
  return { vibration, pulses, advance: (ms: number) => { time += ms; } };
}
const kerb = [{ surface: 'kerb' as const, load: 3000 }];

afterEach(() => vi.unstubAllGlobals());

describe('phone vibration contacts', () => {
  it('pulses for a loaded wheel on a kerb at driving speed', () => {
    const { vibration, pulses } = harness();
    expect(vibration.kerb(kerb, 20)).toBe(true);
    expect(pulses).toEqual([18]);
  });

  it('ignores airborne kerb samples, road/grass and a parked car', () => {
    const { vibration, pulses } = harness();
    expect(vibration.kerb([{ surface: 'kerb', load: 0 }], 20)).toBe(false);
    expect(vibration.kerb([{ surface: 'road', load: 3000 }, { surface: 'grass', load: 2500 }], 20)).toBe(false);
    expect(vibration.kerb(kerb, 0)).toBe(false);
    expect(vibration.kerb(kerb, 8)).toBe(false);
    expect(pulses).toEqual([]);
  });

  it('keeps a cooldown across contact frames and impacts using real elapsed milliseconds', () => {
    const { vibration, pulses, advance } = harness();
    vibration.kerb(kerb, 20);
    advance(50);
    vibration.kerb(kerb, 20);
    vibration.impact(25);
    advance(149);
    vibration.kerb(kerb, 20);
    expect(pulses).toEqual([18]);
    advance(1);
    expect(vibration.impact(25)).toBe(true);
    expect(pulses).toEqual([18, 59]);
  });

  it('gives an actual impact a short severity-dependent pulse and ignores zero-speed contact', () => {
    const { vibration, pulses, advance } = harness();
    expect(vibration.impact(0)).toBe(false);
    expect(vibration.impact(3)).toBe(true);
    advance(200);
    expect(vibration.impact(30)).toBe(true);
    expect(pulses).toEqual([26, 60]);
  });
});

describe('phone vibration setting and API', () => {
  it('offers On/Off without changing controller or touch settings', () => {
    expect(DEFAULT_SETTINGS.phoneVibration).toBe(true);
    const field = ALL_FIELDS.find((f) => f.key === 'phoneVibration');
    if (!field) throw new Error('phone vibration setting missing');
    expect(valueLabel(field, DEFAULT_SETTINGS)).toBe('On');
    const off = adjustSetting(DEFAULT_SETTINGS, field, 1);
    expect(off).toEqual({ ...DEFAULT_SETTINGS, phoneVibration: false });
    expect(valueLabel(field, off)).toBe('Off');
  });

  it('Off prevents pulses; turning it off stops a currently active pulse once', () => {
    const { vibration, pulses, advance } = harness();
    vibration.setEnabled(false);
    vibration.kerb(kerb, 20);
    vibration.impact(30);
    expect(pulses).toEqual([]);
    vibration.setEnabled(true);
    vibration.impact(30);
    advance(10);
    vibration.setEnabled(false);
    vibration.setEnabled(false);
    advance(200);
    vibration.kerb(kerb, 20);
    expect(pulses).toEqual([60, 0]);
  });

  it('is quiet when the browser has no vibration API, including iPhone', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' });
    const vibration = new PhoneVibration();
    expect(vibration.kerb(kerb, 20)).toBe(false);
    expect(vibration.impact(30)).toBe(false);
    expect(() => vibration.setEnabled(false)).not.toThrow();
  });

  it('uses the supported browser API with its navigator receiver', () => {
    const pulses: number[] = [];
    const browser = { vibrate(ms: number): boolean { expect(this).toBe(browser); pulses.push(ms); return true; } };
    vi.stubGlobal('navigator', browser);
    expect(new PhoneVibration().kerb(kerb, 20)).toBe(true);
    expect(pulses).toEqual([18]);
  });

  it('handles a blocked API without retrying every frame', () => {
    const pulse = vi.fn(() => false);
    let time = 0;
    const vibration = new PhoneVibration(pulse, () => time);
    expect(vibration.kerb(kerb, 20)).toBe(false);
    time = 20;
    expect(vibration.impact(30)).toBe(false);
    expect(pulse).toHaveBeenCalledTimes(1);
  });

  it('keeps driving safe when the API throws', () => {
    const vibration = new PhoneVibration(() => { throw new Error('unsupported'); }, () => 0);
    expect(() => vibration.impact(30)).not.toThrow();
    expect(() => vibration.setEnabled(false)).not.toThrow();
  });
});
