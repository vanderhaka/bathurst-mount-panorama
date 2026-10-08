import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchControls } from '@/input/touch-controls';
import { DEFAULT_TOUCH_OPTIONS, type TouchOptions } from '@/input/touch-model';
import { TouchElement } from './touch-dom-fixture';

let host: EventTarget & { isSecureContext: boolean; screen: { orientation: { angle: number } }; DeviceOrientationEvent: { requestPermission: () => Promise<'granted'> } };
let request: ReturnType<typeof vi.fn<() => Promise<'granted'>>>;
let touch: TouchControls;
let root: TouchElement;
beforeEach(() => {
  request = vi.fn(() => Promise.resolve('granted' as const));
  host = Object.assign(new EventTarget(), { isSecureContext: true, screen: { orientation: { angle: 90 } }, DeviceOrientationEvent: { requestPermission: request } });
  vi.stubGlobal('window', host);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, createElement: (tag: string) => new TouchElement(tag) }));
  touch = new TouchControls(new TouchElement() as unknown as HTMLElement);
  root = touch.el as unknown as TouchElement;
  root.find('tc-steer').rect = { left: 0, top: 100, width: 400, height: 300 };
  root.find('tc-pedal--brake').rect = { left: 600, top: 240, width: 80, height: 120 };
  root.find('tc-pedal--throttle').rect = { left: 700, top: 200, width: 80, height: 160 };
  touch.update(0, true);
});
afterEach(() => { touch?.dispose(); vi.unstubAllGlobals(); });
function configure(values: Partial<TouchOptions>) { touch.configure({ ...DEFAULT_TOUCH_OPTIONS, ...values }); }
function pointer(type: string, id: number, target: TouchElement, x: number, y = 250) {
  root.dispatch(type, { pointerId: id, pointerType: 'touch', target, clientX: x, clientY: y });
}

describe('touch overlay event wiring', () => {
  it('routes two thumbs, captured drag movement, release and cancel without stuck input', () => {
    const zone = root.find('tc-steer'), throttle = root.find('tc-pedal--throttle');
    pointer('pointerdown', 1, zone, 100);
    pointer('pointermove', 1, root, 134);
    pointer('pointerdown', 2, throttle, 740);
    expect(touch.update(1, true)).toEqual({ steer: -0.5, throttle: 1, brake: 0 });
    pointer('pointercancel', 1, root, 134);
    expect(touch.update(1, true).steer).toBe(0);
    pointer('pointerup', 2, root, 740);
    expect(touch.update(1, true).throttle).toBe(0);
    expect(touch.touched).toBe(true);
  });

  it('routes left/right buttons and mirrors displayed controls without inverting steering', () => {
    configure({ mode: 'buttons', leftHanded: true });
    touch.update(0, true);
    expect(root.dataset.mode).toBe('buttons');
    expect(root.dataset.leftHanded).toBe('true');
    const left = root.find('tc-arrow--left'), right = root.find('tc-arrow--right');
    pointer('pointerdown', 1, left, 550);
    expect(touch.update(1, true).steer).toBe(1);
    pointer('pointerdown', 2, right, 700);
    expect(touch.update(1, true).steer).toBe(0);
    pointer('pointerup', 1, root, 550);
    expect(touch.update(1, true).steer).toBe(-1);
  });

  it('samples analog throttle on down/move and slides to brake in a mirrored layout', () => {
    configure({ analogThrottle: true, leftHanded: true });
    const throttle = root.find('tc-pedal--throttle'), brake = root.find('tc-pedal--brake');
    throttle.rect.left = 20; brake.rect.left = 120;
    pointer('pointerdown', 1, throttle, 60, 280);
    expect(touch.update(1, true).throttle).toBe(0.5);
    pointer('pointermove', 1, root, 60, 240);
    expect(touch.update(1, true).throttle).toBe(0.75);
    pointer('pointermove', 1, root, 160, 240);
    expect(touch.update(1, true)).toEqual({ steer: 0, throttle: 0, brake: 1 });
  });

  it('shows a brake-only auto-throttle layout and clears it behind menus/on blur', () => {
    configure({ autoThrottle: true });
    expect(touch.update(1, true).throttle).toBe(1);
    expect(root.dataset.autoThrottle).toBe('true');
    pointer('pointerdown', 1, root.find('tc-pedal--brake'), 640);
    expect(touch.update(0.01, true).throttle).toBe(0);
    expect(touch.update(1, false)).toEqual({ steer: 0, throttle: 0, brake: 0 });
    expect(root.dataset.visible).toBe('false');
    host.dispatchEvent(new Event('blur'));
    expect(touch.update(1, true).throttle).toBe(0);
  });

  it('requests tilt permission only inside the enable button click and re-centres on another tap', async () => {
    configure({ mode: 'tilt' });
    touch.update(0.01, true);
    expect(request).not.toHaveBeenCalled();
    root.find('tc-tilt-enable').dispatch('click');
    expect(request).toHaveBeenCalledTimes(1); // already called before any microtask
    await Promise.resolve();
    host.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 0, gamma: 90 }));
    host.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 24, gamma: 90 }));
    expect(touch.update(0.2, true).steer).toBeGreaterThan(0.9);
    expect(root.dataset.tiltReady).toBe('true');
    root.find('tc-tilt-enable').dispatch('click');
    await Promise.resolve();
    host.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 24, gamma: 90 }));
    expect(touch.update(0.2, true).steer).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps a held pedal while the other thumb enables or centres tilt', async () => {
    configure({ mode: 'tilt' });
    touch.update(0.01, true);
    const button = root.find('tc-tilt-enable');
    pointer('pointerdown', 2, root.find('tc-pedal--throttle'), 740);
    expect(touch.update(1, true).throttle).toBe(1);
    pointer('pointerdown', 3, button, 200);
    button.dispatch('click');
    await Promise.resolve();
    expect(touch.update(1, true).throttle).toBe(1);
    pointer('pointerdown', 4, button, 200);
    button.dispatch('click'); // Centre tilt
    expect(touch.update(1, true).throttle).toBe(1);
    pointer('pointerup', 2, root, 740);
    expect(touch.update(1, true).throttle).toBe(0);
  });
});

describe('steering onboarding hands the permission tap to the touch controls', () => {
  it('requests sensor access through enableTilt, the path the Enable tilt button uses', async () => {
    configure({ mode: 'tilt' });
    const pending = touch.enableTilt();
    expect(request).toHaveBeenCalledTimes(1); // synchronously, as inside a tap
    expect(await pending).toBe('granted');
    root.find('tc-tilt-enable').dispatch('click'); // Centre tilt: access is already granted
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('starts centred when access is granted before the controls are showing', async () => {
    touch.update(0, false);
    configure({ mode: 'tilt' });
    await touch.enableTilt();
    host.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 30, gamma: 90 })); // ignored: not driving yet
    expect(touch.update(0.016, true).steer).toBe(0); // the race starts, the controls show
    host.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 30, gamma: 90 }));
    expect(touch.update(0.2, true).steer).toBeCloseTo(0); // this pose is the centre
    expect(root.dataset.tiltReady).toBe('true');
    expect(root.find('tc-tilt-enable').textContent).toBe('Centre tilt');
    host.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 54, gamma: 90 }));
    expect(touch.update(0.2, true).steer).toBeGreaterThan(0.9);
  });

  it('resolves unavailable without asking when the page cannot use sensors', async () => {
    host.isSecureContext = false;
    expect(await touch.enableTilt()).toBe('unavailable');
    expect(request).not.toHaveBeenCalled();
  });
});
