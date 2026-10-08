/** Touch input math, independent of DOM layout and sensor permissions. + steer = left. */
export type TouchSteeringMode = 'drag' | 'tilt' | 'buttons';
export interface TouchOptions {
  mode: TouchSteeringMode;
  analogThrottle: boolean;
  autoThrottle: boolean;
  leftHanded: boolean;
}
export const DEFAULT_TOUCH_OPTIONS: Readonly<TouchOptions> = {
  mode: 'drag', analogThrottle: false, autoThrottle: false, leftHanded: false,
};

/** Old saves omit these fields; malformed values retain the original touch defaults. */
export function touchOptions(s: {
  touchMode?: unknown; touchAnalogThrottle?: unknown; touchAutoThrottle?: unknown; touchLeftHanded?: unknown;
}): TouchOptions {
  return {
    mode: s.touchMode === 'tilt' || s.touchMode === 'buttons' ? s.touchMode : 'drag',
    analogThrottle: s.touchAnalogThrottle === true,
    autoThrottle: s.touchAutoThrottle === true,
    leftHanded: s.touchLeftHanded === true,
  };
}

/** Whether the player has settled how to steer on touch: the saved flag, or a touch mode other
 * than the default (saved before the question existed, or changed in Settings first). */
export function steerOnboarded(s: { steerOnboarded?: unknown; touchMode?: unknown }): boolean {
  return s.steerOnboarded === true || touchOptions(s).mode !== DEFAULT_TOUCH_OPTIONS.mode;
}

const clamp = (v: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, v));
const approach = (v: number, target: number, up: number, down: number, dt: number): number =>
  v + clamp(target - v, -down * dt, up * dt);

/** Past full lock the drag origin follows the thumb, keeping the way back short. */
export function dragSteer(x: number, origin: number, range: number): { origin: number; steer: number } {
  range = Math.max(1, range);
  const d = x - origin;
  if (Math.abs(d) > range) origin = x - Math.sign(d) * range;
  return { origin, steer: -(x - origin) / range };
}

/** Bottom = zero, top = full; captured thumbs can travel outside the pedal. */
export function analogPedal(y: number, top: number, height: number): number {
  return clamp(1 - (y - top) / Math.max(1, height));
}

/** Nearest pedal centre also works when the layout mirrors their order. */
export function pedalAt(x: number, b: { left: number; width: number }, t: { left: number; width: number }): 'brake' | 'throttle' {
  return Math.abs(x - b.left - b.width / 2) <= Math.abs(x - t.left - t.width / 2) ? 'brake' : 'throttle';
}

type Pointer = { kind: 'drag'; origin: number; y: number; steer: number }
  | { kind: 'button'; side: 'left' | 'right' }
  | { kind: 'pedal'; pedal: 'brake' | 'throttle'; value: number };

export class TouchInputModel {
  options: Readonly<TouchOptions> = { ...DEFAULT_TOUCH_OPTIONS };
  private readonly pointers = new Map<number, Pointer>();
  private throttle = 0;
  private brake = 0;
  private buttonSteer = 0;

  configure(options: TouchOptions): void {
    const old = this.options;
    if (old.mode === options.mode && old.analogThrottle === options.analogThrottle
      && old.autoThrottle === options.autoThrottle && old.leftHanded === options.leftHanded) return;
    this.options = { ...options };
    this.reset();
  }

  dragStart(id: number, x: number, y: number): void {
    this.pointers.set(id, { kind: 'drag', origin: x, y, steer: 0 });
  }
  dragMove(id: number, x: number, range: number): void {
    const p = this.pointers.get(id);
    if (p?.kind === 'drag') Object.assign(p, dragSteer(x, p.origin, range));
  }
  button(id: number, side: 'left' | 'right'): void { this.pointers.set(id, { kind: 'button', side }); }
  pedal(id: number, pedal: 'brake' | 'throttle', value: number): void {
    this.pointers.set(id, { kind: 'pedal', pedal, value: clamp(value) });
  }
  kind(id: number): Pointer['kind'] | undefined { return this.pointers.get(id)?.kind; }
  release(id: number): void { this.pointers.delete(id); }
  reset(): void { this.pointers.clear(); this.throttle = this.brake = this.buttonSteer = 0; }
  get thumb(): Extract<Pointer, { kind: 'drag' }> | null {
    let thumb: Extract<Pointer, { kind: 'drag' }> | null = null;
    for (const p of this.pointers.values()) if (p.kind === 'drag') thumb = p;
    return thumb;
  }

  update(dt: number, show: boolean, tilt = { ready: false, steer: 0 }): { steer: number; throttle: number; brake: number } {
    if (!show) { this.reset(); return { steer: 0, throttle: 0, brake: 0 }; }
    dt = Math.max(0, dt);
    let gas = 0, brk = false, left = false, right = false;
    for (const p of this.pointers.values()) {
      if (p.kind === 'button') { if (p.side === 'left') left = true; else right = true; }
      if (p.kind === 'pedal') {
        if (p.pedal === 'brake') brk = true;
        else gas = Math.max(gas, this.options.analogThrottle ? p.value : 1);
      }
    }
    const target = Number(left) - Number(right);
    const rate = target === 0 ? 5.5 : this.buttonSteer && Math.sign(target) !== Math.sign(this.buttonSteer) ? 7 : 3.2;
    this.buttonSteer = approach(this.buttonSteer, target, rate, rate, dt);
    this.brake = approach(this.brake, brk ? 1 : 0, 9, 10, dt);
    if (this.options.autoThrottle) gas = brk || this.brake > 0 ? 0 : 1;
    this.throttle = this.options.autoThrottle && brk ? 0 : approach(this.throttle, gas, 6, 8, dt);
    const steer = this.options.mode === 'buttons' ? this.buttonSteer
      : this.options.mode === 'tilt' && tilt.ready ? tilt.steer : this.thumb?.steer ?? 0;
    return { steer, throttle: this.throttle, brake: this.brake };
  }
}
