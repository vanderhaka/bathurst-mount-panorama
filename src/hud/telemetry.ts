// Bottom-left driver-input strip: brake / throttle gauges with their value,
// a rotating steering arc, next to the damage schematic.
import '@/hud/telemetry.css';
import type { HudState } from '@/types/hud';
import { h, s, TextSlot, VarSlot } from '@/hud/dom';
import { DamageView } from '@/hud/damage';

/** Steering-arc rotation at full lock, degrees. */
const STEER_LOCK_DEG = 200;

interface Pedal { el: HTMLElement; fill: VarSlot; value: TextSlot }

function pedal(kind: 'brake' | 'throttle', label: string): Pedal {
  const fill = h('i', 'hud-pedal__fill');
  const value = h('span', 'hud-pedal__v');
  const el = h('div', `hud-pedal hud-pedal--${kind}`, undefined, [
    value,
    h('div', 'hud-pedal__track', undefined, [fill]),
    h('span', 'hud-telemetry__label', undefined, [label]),
  ]);
  return { el, fill: new VarSlot(fill, '--f', 200), value: new TextSlot(value) };
}

/** Faint ring with a bright arc at the top and a centre mark: the arc turns with the wheel. */
function wheelSvg(): SVGSVGElement {
  return s('svg', { class: 'hud-wheel__svg', viewBox: '-50 -50 100 100', 'aria-hidden': 'true' }, [
    s('circle', { class: 'hud-wheel__ring', r: 40 }),
    s('path', { class: 'hud-wheel__arc', d: 'M-25.7,-30.6 A40,40 0 0 1 25.7,-30.6' }),
    s('rect', { class: 'hud-wheel__mark', x: -1.6, y: -46, width: 3.2, height: 9 }),
  ]);
}

function pct(v: number): string {
  return String(Math.round(Math.max(0, Math.min(1, v)) * 100));
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
    this.el = h('section', 'hud-panel hud-panel--tr hud-telemetry', { 'aria-label': 'Driver inputs and damage' }, [
      this.damage.el,
      h('i', 'hud-telemetry__rule'),
      h('div', 'hud-pedals', undefined, [this.brake.el, this.throttle.el]),
      h('i', 'hud-telemetry__rule'),
      h('div', 'hud-wheel', undefined, [this.wheel, h('span', 'hud-telemetry__label', undefined, ['STEER'])]),
    ]);
  }

  update(st: HudState): void {
    this.brake.fill.set(Math.max(0, Math.min(1, st.brake)));
    this.brake.value.set(pct(st.brake));
    this.throttle.fill.set(Math.max(0, Math.min(1, st.throttle)));
    this.throttle.value.set(pct(st.throttle));
    this.steer.set(Math.round(-Math.max(-1, Math.min(1, st.steer)) * STEER_LOCK_DEG));
    this.damage.update(st.damage, st.car);
  }
}
