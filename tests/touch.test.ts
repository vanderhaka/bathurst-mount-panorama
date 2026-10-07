import { describe, expect, it } from 'vitest';
import { InputManager } from '@/input/input-manager';
import { dragSteer, type TouchControls } from '@/input/touch-controls';

describe('touch steering', () => {
  it('steers by the drag from where the thumb landed (+ = left)', () => {
    expect(dragSteer(100, 100, 60).steer).toBe(-0);
    expect(dragSteer(130, 100, 60).steer).toBeCloseTo(-0.5, 6);
    expect(dragSteer(40, 100, 60).steer).toBeCloseTo(1, 6);
  });

  it('moves the centre with the thumb past full lock, so the way back stays short', () => {
    const past = dragSteer(200, 100, 60);
    expect(past.steer).toBeCloseTo(-1, 6);
    expect(past.origin).toBe(140);
    // 30 px back from the far point is half lock, not still full lock.
    expect(dragSteer(170, past.origin, 60).steer).toBeCloseTo(-0.5, 6);
  });
});

class FakeWindow {
  addEventListener() {}
  removeEventListener() {}
}

function fakeTouch(controls: { steer: number; throttle: number; brake: number }) {
  const touch = { touched: false, onAction: (_a: string) => {}, shown: false, configure() {}, update(_dt: number, show: boolean) { touch.shown = show; return controls; } };
  return touch;
}

describe('InputManager with touch controls', () => {
  it('drives from the touch controls after a touch, and shows them only with the menus closed', () => {
    Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
    const input = new InputManager(new FakeWindow() as unknown as Window);
    const touch = fakeTouch({ steer: 0.4, throttle: 1, brake: 0 });
    input.attachTouch(touch as unknown as TouchControls);
    expect(input.update(1 / 60).throttle).toBe(0); // keyboard until the first touch
    touch.touched = true;
    const c = input.update(1 / 60);
    expect(input.device).toBe('touch');
    expect(c).toEqual({ steer: 0.4, throttle: 1, brake: 0, analogSteer: true });
    expect(touch.shown).toBe(true);
    input.menusOpen = true;
    input.update(1 / 60);
    expect(touch.shown).toBe(false);
  });

  it('turns the pause and camera buttons into actions only while racing', () => {
    const input = new InputManager(new FakeWindow() as unknown as Window);
    const touch = fakeTouch({ steer: 0, throttle: 0, brake: 0 });
    input.attachTouch(touch as unknown as TouchControls);
    touch.onAction('camera');
    expect(input.consume('camera')).toBe(true);
    input.menusOpen = true;
    touch.onAction('pause');
    expect(input.consume('pause')).toBe(false);
  });
});

describe('touch steering sensitivity', () => {
  it('passes Settings > Steering > Touch steering to the touch controls', () => {
    const input = new InputManager(new FakeWindow() as unknown as Window);
    const touch = { ...fakeTouch({ steer: 0, throttle: 0, brake: 0 }), sensitivity: 1 };
    input.attachTouch(touch as unknown as TouchControls);
    input.steerSensitivity.touch = 1.6;
    input.update(1 / 60);
    expect(touch.sensitivity).toBe(1.6);
  });
});
