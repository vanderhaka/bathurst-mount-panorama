// Bottom-right race dash: a row of round shift-light LEDs, a thin segmented
// rev strip with the redline in the accent colour, speed and gear as the hero
// numerals, rpm small, TC / ABS / LIM / AUTO pills, and a slim "next corner"
// tag above it (corner name, suggested speed, racing-line colour chip).
import type { HudState, HudTrackInfo } from '@/types/hud';
import { AttrSlot, h, TextSlot, VarSlot } from '@/hud/dom';
import { displaySpeed, gearLabel, unitLabel } from '@/hud/format';
import { ledColourAt, SHIFT_LED_COUNT, shiftLightCount, shiftPhase } from '@/hud/indicators';
import { nextCornerAfter } from '@/hud/map-geometry';

/** km/h above the recommended corner speed that turns the tag red ("brake"); between 0 and this it is amber ("lift"). */
const BRAKE_MARGIN_KMH = 8;

/** Chip colour for the next-corner tag, matching the racing line (green go, amber lift, red brake). */
export function nextCornerLine(speedKmh: number, recommendedKmh: number): 'go' | 'lift' | 'brake' {
  if (speedKmh > recommendedKmh + BRAKE_MARGIN_KMH) return 'brake';
  if (speedKmh > recommendedKmh) return 'lift';
  return 'go';
}

export class Dash {
  readonly el: HTMLElement;
  private readonly leds: AttrSlot[] = [];
  private readonly phase: AttrSlot;
  private readonly rpmFill: VarSlot;
  private readonly rpmTrack: HTMLElement;
  private readonly rpmScale = h('div', 'hud-rpm__scale');
  private scaleFor = { max: -1, start: -1, shift: -1 };
  private readonly speed = new TextSlot(h('span', 'hud-dash__speed-v'));
  private readonly units = new TextSlot(h('span', 'hud-dash__label'));
  private readonly gear = new TextSlot(h('span', 'hud-dash__gear-v'));
  private readonly rpm = new TextSlot(h('span', 'hud-dash__rpm-v'));
  private readonly mode = new TextSlot(h('span', 'hud-lamp hud-lamp--mode', { 'data-on': 'false' }));
  private readonly modeOn: AttrSlot;
  private readonly tc: AttrSlot;
  private readonly abs: AttrSlot;
  private readonly lim: AttrSlot;
  private readonly next: AttrSlot;
  private readonly brake: AttrSlot;
  private readonly line: AttrSlot;
  private readonly nextName = new TextSlot(h('span', 'hud-next__name'));
  private readonly nextV = new TextSlot(h('span', 'hud-next__v'));
  private readonly nextU = new TextSlot(h('span', 'hud-dash__label'));

  constructor(private readonly track?: Pick<HudTrackInfo, 'corners'>) {
    const ledRow = h('div', 'hud-leds', { 'aria-hidden': 'true' });
    for (let i = 0; i < SHIFT_LED_COUNT; i++) {
      const led = h('i', 'hud-led', { 'data-c': ledColourAt(i), 'data-lit': 'false' });
      ledRow.append(led);
      this.leds.push(new AttrSlot(led, 'data-lit'));
    }
    const lit = h('i', 'hud-rpm__lit');
    this.rpmTrack = h('div', 'hud-rpm__track', undefined, [lit, h('i', 'hud-rpm__gaps')]);
    this.rpmFill = new VarSlot(lit, '--f', 400);
    const lamp = (label: string): HTMLElement => h('span', 'hud-lamp', { 'data-on': 'false' }, [label]);
    const tc = lamp('TC');
    const abs = lamp('ABS');
    const lim = lamp('LIM');
    lim.classList.add('hud-lamp--lim');
    this.tc = new AttrSlot(tc, 'data-on');
    this.abs = new AttrSlot(abs, 'data-on');
    this.lim = new AttrSlot(lim, 'data-on');
    this.modeOn = new AttrSlot(this.mode.el, 'data-on');
    const nextTag = h('div', 'hud-panel hud-panel--tr hud-panel--plain hud-next', { 'data-on': 'false', 'data-brake': 'false', 'data-line': 'go' }, [
      h('i', 'hud-next__chip'),
      this.nextName.el,
      h('span', 'hud-next__val', undefined, [this.nextV.el, this.nextU.el]),
    ]);
    this.next = new AttrSlot(nextTag, 'data-on');
    this.brake = new AttrSlot(nextTag, 'data-brake');
    this.line = new AttrSlot(nextTag, 'data-line');
    const cluster = h('div', 'hud-panel hud-panel--tr hud-dash__bezel', { 'data-phase': 'off' }, [
      ledRow,
      h('div', 'hud-rpm', undefined, [this.rpmTrack, this.rpmScale]),
      h('div', 'hud-dash__main', undefined, [
        h('div', 'hud-dash__speed', undefined, [this.speed.el, this.units.el]),
        h('div', 'hud-dash__gear', undefined, [this.gear.el]),
        h('div', 'hud-dash__rpm', undefined, [this.rpm.el, h('span', 'hud-dash__label', undefined, ['RPM'])]),
      ]),
      h('div', 'hud-dash__lamps', undefined, [tc, abs, lim, h('span', 'hud-dash__spacer'), this.mode.el]),
    ]);
    this.phase = new AttrSlot(cluster, 'data-phase');
    this.el = h('section', 'hud-dash', { 'aria-label': 'Dash' }, [nextTag, cluster]);
  }

  /** RPM scale numbers (x1000), fine ticks every 500 rpm, and the amber / red zone boundaries. */
  private buildScale(maxRpm: number, startRpm: number, shiftRpm: number): void {
    if (maxRpm === this.scaleFor.max && startRpm === this.scaleFor.start && shiftRpm === this.scaleFor.shift) return;
    this.scaleFor = { max: maxRpm, start: startRpm, shift: shiftRpm };
    this.rpmTrack.style.setProperty('--warn', String(startRpm / maxRpm));
    this.rpmTrack.style.setProperty('--red', String(shiftRpm / maxRpm));
    this.rpmScale.style.setProperty('--ticks', String(Math.max(1, maxRpm / 500)));
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
    this.modeOn.set(s.gearMode === 'auto' ? 'true' : 'false');
    this.tc.set(s.tcActive ? 'true' : 'false');
    this.abs.set(s.absActive ? 'true' : 'false');
    this.lim.set(s.onLimiter ? 'true' : 'false');
    const rec = s.nextCornerSpeedKmh;
    this.next.set(rec === null ? 'false' : 'true');
    if (rec !== null) {
      const corner = this.track ? nextCornerAfter(this.track.corners, s.progress) : null;
      this.nextName.set((corner?.name ?? 'Next corner').toUpperCase());
      this.nextV.set(String(displaySpeed(rec, s.units)));
      this.nextU.set(unitLabel(s.units));
      const line = nextCornerLine(s.speedKmh, rec);
      this.line.set(line);
      this.brake.set(line === 'brake' ? 'true' : 'false');
    }
  }
}
