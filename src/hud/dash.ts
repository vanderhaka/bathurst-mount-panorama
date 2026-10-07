// Bottom-right race dash inspired by a MoTeC colour display: shift-light LED
// strip in the bezel, segmented RPM bar graph, big gear digit, speed, RPM,
// TC / ABS / LIM lamps, AUTO / MAN mode, and a "next corner" speed chip.
import type { HudState } from '@/types/hud';
import { AttrSlot, h, TextSlot, VarSlot } from '@/hud/dom';
import { displaySpeed, gearLabel, unitLabel } from '@/hud/format';
import { ledColourAt, SHIFT_LED_COUNT, shiftLightCount, shiftPhase } from '@/hud/indicators';

/** km/h above the recommended corner speed that turns the chip to "brake". */
const BRAKE_MARGIN_KMH = 8;

export class Dash {
  readonly el: HTMLElement;
  private readonly leds: AttrSlot[] = [];
  private readonly phase: AttrSlot;
  private readonly rpmFill: VarSlot;
  private readonly rpmTrack: HTMLElement;
  private readonly rpmScale = h('div', 'hud-rpm__scale');
  private scaleFor = { max: -1, start: -1, shift: -1 };
  private readonly speed = new TextSlot(h('span', 'hud-dash__speed-v'));
  private readonly units = new TextSlot(h('span', 'hud-micro'));
  private readonly gear = new TextSlot(h('span', 'hud-dash__gear-v'));
  private readonly rpm = new TextSlot(h('span', 'hud-dash__rpm-v'));
  private readonly mode = new TextSlot(h('span', 'hud-lamp hud-lamp--mode'));
  private readonly tc: AttrSlot;
  private readonly abs: AttrSlot;
  private readonly lim: AttrSlot;
  private readonly next: AttrSlot;
  private readonly brake: AttrSlot;
  private readonly nextV = new TextSlot(h('span', 'hud-next__v'));
  private readonly nextU = new TextSlot(h('span', 'hud-micro'));

  constructor() {
    const ledRow = h('div', 'hud-leds', { 'aria-hidden': 'true' });
    for (let i = 0; i < SHIFT_LED_COUNT; i++) {
      const led = h('i', 'hud-led', { 'data-c': ledColourAt(i), 'data-lit': 'false' });
      ledRow.append(led);
      this.leds.push(new AttrSlot(led, 'data-lit'));
    }
    const fill = h('i', 'hud-rpm__cover');
    this.rpmTrack = h('div', 'hud-rpm__track', undefined, [h('i', 'hud-rpm__lit'), fill, h('i', 'hud-rpm__gaps')]);
    this.rpmFill = new VarSlot(this.rpmTrack, '--f', 400);
    const lamp = (label: string): HTMLElement => h('span', 'hud-lamp', { 'data-on': 'false' }, [label]);
    const tc = lamp('TC');
    const abs = lamp('ABS');
    const lim = lamp('LIM');
    lim.classList.add('hud-lamp--lim');
    this.tc = new AttrSlot(tc, 'data-on');
    this.abs = new AttrSlot(abs, 'data-on');
    this.lim = new AttrSlot(lim, 'data-on');
    const nextChip = h('div', 'hud-panel hud-next', { 'data-on': 'false', 'data-brake': 'false' }, [
      h('span', 'hud-micro', undefined, ['NEXT CORNER']),
      h('span', 'hud-next__val', undefined, [this.nextV.el, this.nextU.el]),
    ]);
    this.next = new AttrSlot(nextChip, 'data-on');
    this.brake = new AttrSlot(nextChip, 'data-brake');
    const screen = h('div', 'hud-dash__screen', undefined, [
      h('div', 'hud-rpm', undefined, [this.rpmTrack, this.rpmScale]),
      h('div', 'hud-dash__main', undefined, [
        h('div', 'hud-dash__speed', undefined, [this.speed.el, this.units.el]),
        h('div', 'hud-dash__gear', undefined, [this.gear.el]),
        h('div', 'hud-dash__rpm', undefined, [this.rpm.el, h('span', 'hud-micro', undefined, ['RPM'])]),
      ]),
      h('div', 'hud-dash__lamps', undefined, [tc, abs, lim, h('span', 'hud-dash__spacer'), this.mode.el]),
    ]);
    const cluster = h('div', 'hud-dash__bezel', { 'data-phase': 'off' }, [ledRow, screen]);
    this.phase = new AttrSlot(cluster, 'data-phase');
    this.el = h('section', 'hud-dash', { 'aria-label': 'Dash' }, [nextChip, cluster]);
  }

  /** RPM scale numbers (x1000) and the amber / red zone boundaries. */
  private buildScale(maxRpm: number, startRpm: number, shiftRpm: number): void {
    if (maxRpm === this.scaleFor.max && startRpm === this.scaleFor.start && shiftRpm === this.scaleFor.shift) return;
    this.scaleFor = { max: maxRpm, start: startRpm, shift: shiftRpm };
    this.rpmTrack.style.setProperty('--warn', String(startRpm / maxRpm));
    this.rpmTrack.style.setProperty('--red', String(shiftRpm / maxRpm));
    this.rpmScale.replaceChildren();
    for (let k = 1; k * 1000 <= maxRpm; k++) {
      const x = ((k * 1000) / maxRpm) * 100;
      this.rpmScale.append(h('span', k * 1000 >= shiftRpm ? 'is-red' : '', { style: `left:${x.toFixed(2)}%` }, [String(k)]));
    }
  }

  update(s: HudState): void {
    this.buildScale(Math.max(1000, s.maxRpm), s.shiftLightStartRpm, s.shiftRpm);
    const lit = shiftLightCount(s.rpm, s.shiftLightStartRpm, s.shiftRpm);
    for (let i = 0; i < this.leds.length; i++) this.leds[i].set(i < lit ? 'true' : 'false');
    this.phase.set(shiftPhase(s.rpm, s.shiftLightStartRpm, s.shiftRpm, s.onLimiter));
    this.rpmFill.set(Math.max(0, Math.min(1, s.rpm / Math.max(1000, s.maxRpm))));
    this.speed.set(String(displaySpeed(s.speedKmh, s.units)));
    this.units.set(unitLabel(s.units));
    this.gear.set(gearLabel(s.gear));
    this.rpm.set(String(Math.max(0, Math.round(s.rpm / 10) * 10)));
    this.mode.set(s.gearMode === 'auto' ? 'AUTO' : 'MAN');
    this.tc.set(s.tcActive ? 'true' : 'false');
    this.abs.set(s.absActive ? 'true' : 'false');
    this.lim.set(s.onLimiter ? 'true' : 'false');
    const rec = s.nextCornerSpeedKmh;
    this.next.set(rec === null ? 'false' : 'true');
    if (rec !== null) {
      this.nextV.set(String(displaySpeed(rec, s.units)));
      this.nextU.set(unitLabel(s.units));
      this.brake.set(s.speedKmh > rec + BRAKE_MARGIN_KMH ? 'true' : 'false');
    }
  }
}
