// On-screen touch controls for phones and tablets (landscape). Left half: put a
// thumb down anywhere and drag sideways to steer (the centre is where the thumb
// lands, and it follows the thumb past full lock). Right: brake and throttle pedals
// (slide the thumb from one to the other) and the pause and camera buttons. The
// input layer shows them only while racing, after the last input was a touch.
import '@/input/touch.css';
import { h } from '@/hud/dom';
import type { GameAction } from '@/input/bindings';

/** Thumb travel for full steering lock, as a fraction of the short screen side. */
const STEER_RANGE = 0.17;

/**
 * Steering (+ = left, like the stick) for a thumb at x that landed at `origin`.
 * Past full lock the origin follows the thumb, so the way back to centre stays short.
 */
export function dragSteer(x: number, origin: number, range: number): { origin: number; steer: number } {
  const d = x - origin;
  if (Math.abs(d) > range) origin = x - Math.sign(d) * range;
  return { origin, steer: -(x - origin) / range };
}

type Pointer = { kind: 'steer'; origin: number; y: number; steer: number } | { kind: 'pedal'; pedal: 'brake' | 'throttle' };

function ramp(v: number, on: boolean, up: number, down: number, dt: number): number {
  return Math.max(0, Math.min(1, v + (on ? up : -down) * dt));
}

export class TouchControls {
  readonly el: HTMLElement;
  /** Set by any touch on the page; the input layer reads and clears it. */
  touched = false;
  /** Pause and camera buttons. */
  onAction: (action: GameAction) => void = () => {};
  /** Settings > Steering > Touch steering: a higher value needs a shorter drag for full lock. */
  sensitivity = 1;
  private readonly pointers = new Map<number, Pointer>();
  private readonly steerZone = h('div', 'tc-steer');
  private readonly wheel = h('div', 'tc-wheel', { 'aria-hidden': 'true' }, [h('i', 'tc-wheel__knob')]);
  private readonly brakeEl = h('div', 'tc-pedal tc-pedal--brake', undefined, ['Brake']);
  private readonly throttleEl = h('div', 'tc-pedal tc-pedal--throttle', undefined, ['Throttle']);
  private throttle = 0;
  private brake = 0;
  private visible = false;

  constructor(container: HTMLElement) {
    this.steerZone.append(this.wheel, h('span', 'tc-steer__hint', undefined, ['Drag to steer']));
    const button = (action: GameAction, label: string, text: string) => {
      const b = h('button', `tc-btn tc-btn--${action}`, { type: 'button', 'aria-label': label }, [text]);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onAction(action);
      });
      return b;
    };
    this.el = h('div', 'bx-touch', { 'data-visible': 'false' }, [
      this.steerZone,
      h('div', 'tc-buttons', undefined, [button('pause', 'Pause', 'II'), button('camera', 'Change camera', 'View')]),
      h('div', 'tc-pedals', undefined, [this.brakeEl, this.throttleEl]),
    ]);
    this.el.addEventListener('pointerdown', this.onDown);
    this.el.addEventListener('pointermove', this.onMove);
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('pointercancel', this.onUp);
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.touched = true; }, true);
    container.append(this.el);
  }

  private range(): number {
    return (STEER_RANGE * Math.min(this.el.clientWidth, this.el.clientHeight)) / this.sensitivity;
  }

  /** Brake left of throttle: the pedal under a thumb is the one on its side of the gap. */
  private pedalAt(x: number): 'brake' | 'throttle' {
    const b = this.brakeEl.getBoundingClientRect(), t = this.throttleEl.getBoundingClientRect();
    return x < (b.right + t.left) / 2 ? 'brake' : 'throttle';
  }

  private readonly onDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement;
    if (this.steerZone.contains(target)) this.pointers.set(e.pointerId, { kind: 'steer', origin: e.clientX, y: e.clientY, steer: 0 });
    else if (target.closest('.tc-pedals')) this.pointers.set(e.pointerId, { kind: 'pedal', pedal: this.pedalAt(e.clientX) });
    else return;
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (p.kind === 'pedal') p.pedal = this.pedalAt(e.clientX);
    else Object.assign(p, dragSteer(e.clientX, p.origin, this.range()));
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  /** Advances the pedal ramps and the visuals; returns this frame's driver controls. */
  update(dt: number, show: boolean): { steer: number; throttle: number; brake: number } {
    if (show !== this.visible) {
      this.visible = show;
      this.el.dataset.visible = String(show);
      if (!show) this.pointers.clear();
    }
    let steer = 0, gas = false, brk = false, thumb: Extract<Pointer, { kind: 'steer' }> | null = null;
    for (const p of this.pointers.values()) {
      if (p.kind === 'steer') { steer = p.steer; thumb = p; }
      else if (p.pedal === 'throttle') gas = true;
      else brk = true;
    }
    // Same response as the keyboard keys: full throttle in about 0.17 s, full brake in 0.11 s.
    this.throttle = ramp(this.throttle, gas, 6, 8, dt);
    this.brake = ramp(this.brake, brk, 9, 10, dt);
    if (show) this.draw(thumb, steer, gas, brk);
    return { steer, throttle: this.throttle, brake: this.brake };
  }

  private draw(thumb: { origin: number; y: number } | null, steer: number, gas: boolean, brk: boolean): void {
    const zone = this.steerZone.getBoundingClientRect();
    const range = this.range();
    this.wheel.style.width = `${range * 2}px`;
    this.wheel.dataset.active = String(!!thumb);
    this.wheel.style.left = thumb ? `${thumb.origin - zone.left}px` : '';
    this.wheel.style.top = thumb ? `${thumb.y - zone.top}px` : '';
    this.wheel.style.setProperty('--tc-steer', String(-steer));
    this.throttleEl.classList.toggle('is-on', gas);
    this.brakeEl.classList.toggle('is-on', brk);
  }
}
