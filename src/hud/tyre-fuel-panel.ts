// Compact tyres + fuel panel: four tyre squares coloured by temperature with a
// tread-life strip, fuel litres with a gauge and laps remaining.
// Values come from HudState.tyres / .fuel when the game supplies them,
// otherwise from the DISPLAY-ONLY TyreFuelEstimator.
import type { HudState } from '@/types/hud';
import { AttrSlot, h, TextSlot, VarSlot } from '@/hud/dom';
import { FUEL_START_L, TyreFuelEstimator, tyreBand } from '@/hud/tyre-fuel-model';

const LABELS = ['FL', 'FR', 'RL', 'RR'];

interface TyreView {
  band: AttrSlot;
  temp: TextSlot;
  life: VarSlot;
}

export class TyreFuelPanel {
  readonly el: HTMLElement;
  private readonly model = new TyreFuelEstimator();
  private readonly tyres: TyreView[] = [];
  private readonly litres = new TextSlot(h('span', 'hud-fuel__v'));
  private readonly laps = new TextSlot(h('span', 'hud-fuel__laps-v'));
  private readonly gaugeFill = h('i', 'hud-fuel__fill');
  private readonly gauge = new VarSlot(this.gaugeFill, '--f', 200);
  private readonly low: AttrSlot;

  constructor() {
    const grid = h('div', 'hud-tyres__grid');
    for (const label of LABELS) {
      const temp = h('span', 'hud-tyre__t');
      const life = h('i', 'hud-tyre__life-fill');
      const box = h('div', 'hud-tyre', { 'data-band': 'cold', title: `${label} tyre` }, [
        temp,
        h('i', 'hud-tyre__life', undefined, [life]),
      ]);
      grid.append(box);
      this.tyres.push({ band: new AttrSlot(box, 'data-band'), temp: new TextSlot(temp), life: new VarSlot(life, '--f', 100) });
    }
    const fuel = h('div', 'hud-fuel', { 'data-low': 'false' }, [
      h('span', 'hud-micro', undefined, ['FUEL']),
      h('span', 'hud-fuel__main', undefined, [this.litres.el, h('span', 'hud-fuel__u', undefined, ['L'])]),
      h('i', 'hud-fuel__gauge', undefined, [this.gaugeFill]),
      h('span', 'hud-fuel__laps', undefined, [this.laps.el, h('span', 'hud-micro', undefined, ['LAPS'])]),
    ]);
    this.low = new AttrSlot(fuel, 'data-low');
    // Marked EST: the simulation has no tyre or fuel model (see tyre-fuel-model.ts).
    this.el = h('section', 'hud-panel hud-tyrefuel', { 'aria-label': 'Tyres and fuel, estimated' }, [
      h('header', 'hud-panel__head', undefined, [
        h('span', 'hud-micro hud-micro--strong', undefined, ['TYRES · FUEL']),
        h('span', 'hud-chip hud-chip--est', { title: 'Estimated values' }, ['EST']),
      ]),
      h('div', 'hud-tyrefuel__body', undefined, [
        h('div', 'hud-tyres', undefined, [h('span', 'hud-micro', undefined, ['TYRES °C']), grid]),
        h('i', 'hud-tyrefuel__rule'),
        fuel,
      ]),
    ]);
  }

  update(st: HudState): void {
    this.model.update(st);
    const tyres = st.tyres && st.tyres.length === 4 ? st.tyres : this.model.tyres;
    for (let i = 0; i < 4; i++) {
      const t = tyres[i];
      const v = this.tyres[i];
      v.band.set(tyreBand(t.tempC));
      v.temp.set(String(Math.round(t.tempC)));
      v.life.set(Math.max(0, Math.min(1, 1 - t.wear)));
    }
    const fuel = st.fuel ?? this.model.fuel;
    this.litres.set(fuel.litres.toFixed(1));
    const laps = fuel.lapsLeft;
    this.laps.set(laps === null ? '--' : laps >= 99.5 ? '99+' : laps.toFixed(1));
    this.gauge.set(Math.max(0, Math.min(1, fuel.litres / FUEL_START_L)));
    this.low.set(laps !== null && laps < 2 ? 'true' : 'false');
  }
}
