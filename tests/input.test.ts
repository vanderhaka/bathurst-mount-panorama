import { afterEach, describe, expect, it } from 'vitest';
import { InputManager } from '@/input/input-manager';

/** Minimal event target standing in for `window`. */
class FakeWindow {
  private readonly listeners = new Map<string, Array<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  key(type: 'keydown' | 'keyup', code: string, repeat = false) {
    for (const fn of this.listeners.get(type) ?? []) fn({ code, repeat, preventDefault() {} });
  }
}

function fakePad(buttons: Record<number, number>, axes: number[] = [0, 0, 0, 0]): Gamepad {
  const b = Array.from({ length: 17 }, (_, i) => ({ pressed: (buttons[i] ?? 0) > 0.5, touched: false, value: buttons[i] ?? 0 }));
  return { id: 'Test Pad', index: 0, connected: true, mapping: 'standard', axes, buttons: b, timestamp: 0, hapticActuators: [], vibrationActuator: null } as unknown as Gamepad;
}

const nav = globalThis.navigator as unknown as { getGamepads?: () => Array<Gamepad | null> };
let pads: Array<Gamepad | null> = [];
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => pads }, configurable: true, writable: true });

afterEach(() => { pads = []; });

describe('InputManager', () => {
  it('ramps keyboard throttle and steering smoothly', () => {
    const w = new FakeWindow();
    const input = new InputManager(w as unknown as Window);
    w.key('keydown', 'ArrowUp');
    w.key('keydown', 'ArrowLeft');
    const c1 = input.update(1 / 60);
    expect(c1.throttle).toBeGreaterThan(0);
    expect(c1.throttle).toBeLessThan(0.2);
    for (let i = 0; i < 60; i++) input.update(1 / 60);
    const c2 = input.update(1 / 60);
    expect(c2.throttle).toBeCloseTo(1, 5);
    expect(c2.steer).toBeCloseTo(1, 5); // + = left
    expect(c2.analogSteer).toBe(false);
  });

  it('reads gamepad triggers and stick with dead zones and a response curve', () => {
    const input = new InputManager(new FakeWindow() as unknown as Window);
    pads = [fakePad({ 7: 0.8, 6: 0.02 }, [0.05, 0, 0, 0])];
    let c = input.update(1 / 60);
    expect(input.device).toBe('gamepad');
    expect(c.throttle).toBeCloseTo((0.8 - 0.04) / 0.96, 3);
    expect(c.brake).toBe(0); // inside the trigger dead zone
    expect(c.steer).toBe(0); // inside the stick dead zone
    pads = [fakePad({ 7: 0.8 }, [1, 0, 0, 0])];
    c = input.update(1 / 60);
    expect(c.steer).toBeCloseTo(-1, 5); // stick right = steer right (negative)
    pads = [fakePad({ 7: 0.8 }, [-0.5, 0, 0, 0])];
    c = input.update(1 / 60);
    expect(c.steer).toBeGreaterThan(0);
    expect(c.steer).toBeLessThan(0.5); // curve: half stick < half lock
    expect(c.analogSteer).toBe(true);
  });

  it('turns gamepad buttons into one-shot actions and menu navigation', () => {
    const input = new InputManager(new FakeWindow() as unknown as Window);
    pads = [fakePad({ 0: 1 })]; // A = shift up
    input.update(1 / 60);
    expect(input.consume('shiftUp')).toBe(true);
    expect(input.consume('shiftUp')).toBe(false);
    input.update(1 / 60); // still held: no new press
    expect(input.consume('shiftUp')).toBe(false);
    input.menusOpen = true;
    pads = [fakePad({ 13: 1 })]; // D-pad down
    input.update(1 / 60);
    expect(input.takeMenuNav()).toBe('down');
  });

  it('ignores game keys while menus are open but still opens the tuner', () => {
    const w = new FakeWindow();
    const input = new InputManager(w as unknown as Window);
    input.menusOpen = true;
    w.key('keydown', 'KeyR');
    w.key('keydown', 'F2');
    expect(input.consume('reset')).toBe(false);
    expect(input.consume('tuner')).toBe(true);
    w.key('keydown', 'KeyT'); // T opens the tuner on a Mac keyboard (F2 is screen brightness there)
    expect(input.consume('tuner')).toBe(true);
  });

  it('changes the camera with R1 / RB in a race, and the tab with L1 / R1 in the menus', () => {
    const input = new InputManager(new FakeWindow() as unknown as Window);
    pads = [fakePad({ 5: 1 })]; // RB / R1
    input.update(1 / 60);
    expect(input.consume('camera')).toBe(true);
    expect(input.takeMenuNav()).toBeUndefined();
    pads = [fakePad({ 3: 1 })]; // Y / triangle
    input.update(1 / 60);
    expect(input.consume('racingLine')).toBe(true);
    input.menusOpen = true;
    pads = [fakePad({})];
    input.update(1 / 60);
    for (const [button, nav] of [[4, 'prevTab'], [5, 'nextTab']] as const) {
      pads = [fakePad({ [button]: 1 })];
      input.update(1 / 60);
      expect(input.takeMenuNav()).toBe(nav);
      pads = [fakePad({})];
      input.update(1 / 60);
    }
    expect(input.consume('camera')).toBe(false);
    expect(input.consume('ghost')).toBe(false);
  });
});

void nav;
