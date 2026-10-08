// Bottom-left driver-input graphic: brake / throttle bars and a rotating
// steering wheel, next to the damage schematic.
import type { HudState } from '@/types/hud';
import { h, s, VarSlot } from '@/hud/dom';
import { DamageView } from '@/hud/damage';

/** Steering-wheel rotation at full lock, degrees. */
const STEER_LOCK_DEG = 200;

function pedal(kind: 'brake' | 'throttle', label: string): { el: HTMLElement; fill: VarSlot } {
  const fill = h('i', 'hud-pedal__fill');
  const el = h('div', `hud-pedal hud-pedal--${kind}`, undefined, [
    h('div', 'hud-pedal__track', undefined, [fill]),
    h('span', 'hud-micro', undefined, [label]),
  ]);
  return { el, fill: new VarSlot(fill, '--f', 200) };
}

/** GT-style race wheel: thick side grips, flat top and bottom bars, hub with display. */
function wheelSvg(): SVGSVGElement {
  return s('svg', { class: 'hud-wheel__svg', viewBox: '-50 -50 100 100', 'aria-hidden': 'true' }, [
    s('path', { class: 'hud-wheel__bar', d: 'M-33,-25 Q0,-33 33,-25 M-31,27 H31' }),
    s('path', { class: 'hud-wheel__spoke', d: 'M-33,-4 H-20 M20,-4 H33 M-9,13 L-14,26 M9,13 L14,26' }),
    s('rect', { class: 'hud-wheel__grip', x: -47, y: -29, width: 15, height: 60, rx: 7.5 }),
    s('rect', { class: 'hud-wheel__grip', x: 32, y: -29, width: 15, height: 60, rx: 7.5 }),
    s('rect', { class: 'hud-wheel__hub', x: -21, y: -17, width: 42, height: 31, rx: 4 }),
    s('rect', { class: 'hud-wheel__screen', x: -14, y: -12, width: 28, height: 13, rx: 1.5 }),
    s('rect', { class: 'hud-wheel__mark', x: -2.5, y: -36.5, width: 5, height: 9 }),
  ]);
}

export class Telemetry {
  readonly el: HTMLElement;
  private readonly brake = pedal('brake', 'BRK');
  private readonly throttle = pedal('throttle', 'THR');
  private readonly wheel = h('div', 'hud-wheel__rot');
  private readonly steer = new VarSlot(this.wheel, '--a', 1);
  private readonly damage = new DamageView();

  constructor() {
    this.wheel.append(wheelSvg());
    this.el = h('section', 'hud-panel hud-telemetry', { 'aria-label': 'Driver inputs and damage' }, [
      this.damage.el,
      h('i', 'hud-telemetry__rule'),
      h('div', 'hud-pedals', undefined, [this.brake.el, this.throttle.el]),
      h('div', 'hud-wheel', undefined, [this.wheel, h('span', 'hud-micro', undefined, ['STEER'])]),
    ]);
  }

  update(st: HudState): void {
    this.brake.fill.set(Math.max(0, Math.min(1, st.brake)));
    this.throttle.fill.set(Math.max(0, Math.min(1, st.throttle)));
    this.steer.set(Math.round(-Math.max(-1, Math.min(1, st.steer)) * STEER_LOCK_DEG));
    this.damage.update(st.damage, st.car);
  }
}
