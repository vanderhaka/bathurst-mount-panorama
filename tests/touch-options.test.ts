import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN_ANALOG_BRAKE, TouchInputModel, analogPedal, pedalAt, touchOptions, type TouchOptions } from '@/input/touch-model';
import { loadSettings, saveSettings } from '@/game/settings-store';
import { DEFAULT_SETTINGS } from '@/types/session';
import { SETTING_GROUPS, adjustSetting, valueLabel } from '@/ui/settings-model';
import { InputManager } from '@/input/input-manager';
import type { TouchControls } from '@/input/touch-controls';

const defaults: TouchOptions = { mode: 'drag', analogThrottle: false, analogBrake: false, autoThrottle: false, leftHanded: false };
const step = (m: TouchInputModel) => m.update(1, true);
afterEach(() => vi.unstubAllGlobals());

describe('touch driving modes', () => {
  it('retains floating drag origin and releases each thumb independently', () => {
    const m = new TouchInputModel();
    m.dragStart(1, 100, 200);
    m.dragMove(1, 200, 60);
    m.pedal(2, 'throttle', 1);
    expect(step(m)).toEqual({ steer: -1, throttle: 1, brake: 0 });
    expect(m.thumb?.origin).toBe(140);
    m.dragMove(1, 170, 60);
    expect(step(m).steer).toBeCloseTo(-0.5);
    m.release(1);
    expect(step(m)).toEqual({ steer: 0, throttle: 1, brake: 0 });
    m.release(2);
    expect(step(m).throttle).toBe(0);
  });

  it('ramps left/right buttons, cancels opposing thumbs and centres on release', () => {
    const m = new TouchInputModel();
    m.configure({ ...defaults, mode: 'buttons' });
    m.button(1, 'left');
    expect(m.update(1 / 60, true).steer).toBeCloseTo(3.2 / 60);
    expect(step(m).steer).toBe(1);
    m.button(2, 'right');
    expect(step(m).steer).toBe(0);
    m.release(1);
    expect(step(m).steer).toBe(-1);
    m.release(2);
    expect(step(m).steer).toBe(0);
  });

  it('uses calibrated tilt when ready and keeps drag usable before permission/data', () => {
    const m = new TouchInputModel();
    m.configure({ ...defaults, mode: 'tilt' });
    m.dragStart(1, 100, 200);
    m.dragMove(1, 130, 60);
    expect(step(m).steer).toBeCloseTo(-0.5);
    expect(m.update(1, true, { ready: true, steer: 0.7 }).steer).toBe(0.7);
    expect(m.update(1, true, { ready: false, steer: 0 }).steer).toBeCloseTo(-0.5);
  });

  it('maps the throttle bottom/middle/top to zero/half/full and clamps outside', () => {
    expect([250, 200, 150, 100, 50].map((y) => analogPedal(y, 100, 100))).toEqual([0, 0, 0.5, 1, 1]);
    const m = new TouchInputModel();
    m.configure({ ...defaults, analogThrottle: true });
    m.pedal(1, 'throttle', analogPedal(150, 100, 100));
    expect(step(m).throttle).toBe(0.5);
    m.pedal(1, 'throttle', 0.2);
    expect(step(m).throttle).toBe(0.2);
    m.release(1);
    expect(step(m).throttle).toBe(0);
  });

  it('maps an analog brake by thumb height, never below a light minimum', () => {
    const m = new TouchInputModel();
    m.configure({ ...defaults, analogBrake: true });
    m.pedal(1, 'brake', analogPedal(150, 100, 100));
    expect(step(m).brake).toBe(0.5);
    m.pedal(1, 'brake', analogPedal(250, 100, 100));
    expect(step(m).brake).toBe(MIN_ANALOG_BRAKE);
    expect(MIN_ANALOG_BRAKE).toBeGreaterThan(0);
    m.pedal(1, 'brake', 1);
    expect(step(m).brake).toBe(1);
    m.release(1);
    expect(step(m).brake).toBe(0);
  });

  it('keeps the default brake full at any height, and analog brake with auto-throttle still cuts power', () => {
    const m = new TouchInputModel();
    m.pedal(1, 'brake', 0);
    expect(step(m).brake).toBe(1);
    m.configure({ ...defaults, analogBrake: true, autoThrottle: true });
    m.pedal(1, 'brake', 0.4);
    expect(step(m)).toEqual({ steer: 0, throttle: 0, brake: 0.4 });
  });

  it('keeps the default throttle digital even at the bottom of its pedal', () => {
    const m = new TouchInputModel();
    m.pedal(1, 'throttle', 0);
    expect(m.update(1 / 60, true).throttle).toBeCloseTo(0.1);
    expect(step(m).throttle).toBe(1);
  });

  it('auto-throttles only while driving and cuts power as soon as brake is touched', () => {
    const m = new TouchInputModel();
    m.configure({ ...defaults, autoThrottle: true });
    expect(step(m).throttle).toBe(1);
    m.pedal(1, 'brake', 1);
    const braking = m.update(1 / 60, true);
    expect(braking.throttle).toBe(0);
    expect(braking.brake).toBeGreaterThan(0);
    m.release(1);
    expect(step(m).throttle).toBe(1);
    expect(m.update(1 / 60, false)).toEqual({ steer: 0, throttle: 0, brake: 0 });
  });

  it('uses pedal geometry in either layout and keeps steering signs unchanged', () => {
    expect(pedalAt(350, { left: 300, width: 100 }, { left: 420, width: 100 })).toBe('brake');
    expect(pedalAt(470, { left: 300, width: 100 }, { left: 420, width: 100 })).toBe('throttle');
    expect(pedalAt(50, { left: 120, width: 100 }, { left: 0, width: 100 })).toBe('throttle');
    expect(pedalAt(170, { left: 120, width: 100 }, { left: 0, width: 100 })).toBe('brake');
    for (const leftHanded of [true, false]) {
      const m = new TouchInputModel();
      m.configure({ ...defaults, leftHanded });
      m.dragStart(1, 500, 200);
      m.dragMove(1, 440, 60);
      expect(step(m).steer).toBe(1);
    }
  });

  it('clears held input when changing modes/layout or hiding; repeated settings keep it', () => {
    const m = new TouchInputModel();
    m.pedal(1, 'throttle', 1);
    m.configure(defaults);
    expect(step(m).throttle).toBe(1);
    m.configure({ ...defaults, leftHanded: true });
    expect(step(m).throttle).toBe(0);
    m.pedal(1, 'brake', 1);
    expect(m.update(1, false)).toEqual({ steer: 0, throttle: 0, brake: 0 });
    expect(step(m)).toEqual({ steer: 0, throttle: 0, brake: 0 });
  });
});

describe('touch settings', () => {
  it('offers the four options in Steering and leaves existing steering/handling defaults', () => {
    const fields = SETTING_GROUPS.find((g) => g.title === 'Steering')!.fields;
    for (const key of ['touchMode', 'touchAnalogThrottle', 'touchAnalogBrake', 'touchAutoThrottle', 'touchLeftHanded']) {
      expect(fields.some((f) => f.key === key)).toBe(true);
    }
    const mode = fields.find((f) => f.key === 'touchMode')!;
    let s = { ...DEFAULT_SETTINGS };
    expect(valueLabel(mode, s)).toBe('Drag');
    s = adjustSetting(s, mode, 1);
    expect(s.touchMode).toBe('tilt');
    s = adjustSetting(s, mode, 1);
    expect(s.touchMode).toBe('buttons');
    s = adjustSetting(s, mode, 1);
    expect(s.touchMode).toBe('drag');
    expect(touchOptions(s)).toEqual(defaults);
    expect([s.steerKeyboard, s.steerPad, s.steerTouch]).toEqual([1, 1, 1]);
  });

  it('migrates old saved settings and round-trips the new choices without sensor work', () => {
    let raw = JSON.stringify({ units: 'mph', steerTouch: 1.3 });
    vi.stubGlobal('localStorage', { getItem: () => raw, setItem: (_k: string, v: string) => { raw = v; } });
    const old = loadSettings();
    expect(touchOptions(old)).toEqual(defaults);
    expect(old.units).toBe('mph');
    expect(old.steerTouch).toBe(1.3);
    expect(old.touchAnalogBrake).toBe(false);
    saveSettings({ ...old, touchMode: 'tilt', touchAnalogThrottle: true, touchAnalogBrake: true, touchAutoThrottle: true, touchLeftHanded: true });
    expect(touchOptions(loadSettings())).toEqual({ mode: 'tilt', analogThrottle: true, analogBrake: true, autoThrottle: true, leftHanded: true });
    raw = JSON.stringify({ touchMode: 'broken', touchAnalogThrottle: 'yes', touchAnalogBrake: 'yes', touchAutoThrottle: null, touchLeftHanded: 1 });
    expect(touchOptions(loadSettings())).toEqual(defaults);
  });
});

describe('touch-only configuration', () => {
  it('applies saved/live choices on attach while keyboard and controller keep their mapping', () => {
    let pad: Gamepad | null = null;
    vi.stubGlobal('navigator', { getGamepads: () => pad ? [pad] : [] });
    const w = new EventTarget(), input = new InputManager(w as Window);
    const m = new TouchInputModel();
    const touch = { touched: false, onAction: () => {}, sensitivity: 1,
      configure: (o: TouchOptions) => m.configure(o), update: (dt: number, show: boolean) => m.update(dt, show) };
    input.configureTouch({ ...defaults, autoThrottle: true, leftHanded: true });
    input.attachTouch(touch as unknown as TouchControls);
    expect(m.options.leftHanded).toBe(true);
    expect(input.update(1).throttle).toBe(0); // keyboard active: auto-throttle stays touch-only
    touch.touched = true;
    expect(input.update(1).throttle).toBe(1);
    for (const code of ['ArrowUp', 'ArrowLeft']) w.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat: false }));
    expect(input.update(1)).toEqual({ steer: 1, throttle: 1, brake: 0, analogSteer: false });
    pad = { id: 'test', connected: true, mapping: 'standard', axes: [1, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: false, value: i === 7 ? 0.6 : 0 })) } as unknown as Gamepad;
    const controller = input.update(1);
    expect(controller.steer).toBe(-1);
    expect(controller.throttle).toBeCloseTo((0.6 - 0.04) / 0.96);
    expect(controller.analogSteer).toBe(true);
    input.configureTouch({ ...defaults, mode: 'buttons' });
    expect(m.options.mode).toBe('buttons');
    expect(m.options.autoThrottle).toBe(false);
    input.dispose();
  });
});
