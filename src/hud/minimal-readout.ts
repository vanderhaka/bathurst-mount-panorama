import { h, TextSlot } from '@/hud/dom';
import { displaySpeed, formatLapTime, gearLabel, unitLabel } from '@/hud/format';
import type { HudState } from '@/types/hud';

type Instruments = Pick<HudState, 'speedKmh' | 'units' | 'gear' | 'lap'>;

/** The compact panel reads the same live values as the full instruments. */
export function minimalReadout(s: Instruments): { speed: string; units: string; gear: string; lapTime: string } {
  return { speed: String(displaySpeed(s.speedKmh, s.units)), units: unitLabel(s.units), gear: gearLabel(s.gear), lapTime: formatLapTime(s.lap.currentS) };
}

export class MinimalReadout {
  private readonly speed = new TextSlot(h('b'));
  private readonly units = new TextSlot(h('span'));
  private readonly gear = new TextSlot(h('b'));
  private readonly lap = new TextSlot(h('b'));
  readonly el = h('section', 'hud-minimal', { 'aria-label': 'Speed, gear and lap time' }, [
    h('div', 'hud-minimal__speed', { 'aria-label': 'Speed' }, [this.speed.el, this.units.el]),
    h('div', 'hud-minimal__gear', { 'aria-label': 'Gear' }, [this.gear.el, h('span', undefined, undefined, ['GEAR'])]),
    h('div', 'hud-minimal__lap', { 'aria-label': 'Current lap time' }, [this.lap.el, h('span', undefined, undefined, ['LAP'])]),
  ]);

  update(s: HudState): void {
    const values = minimalReadout(s);
    this.speed.set(values.speed);
    this.units.set(values.units);
    this.gear.set(values.gear);
    this.lap.set(values.lapTime);
  }
}
