// Compact tyres + fuel panel: four tyre squares coloured by temperature with a
// tread-life strip, fuel litres with a gauge and laps remaining.
// Values come from HudState.tyres / .fuel when the game supplies them,
// otherwise from the DISPLAY-ONLY TyreFuelEstimator.
import { FUEL_CAPACITY_L } from '@/physics/fuel';
import type { HudState } from '@/types/hud';
import { AttrSlot, h, HiddenSlot, TextSlot, VarSlot } from '@/hud/dom';
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
  private readonly estimate = new TextSlot(h('span', 'hud-chip hud-chip--est', { title: 'Estimated values' }));
  private readonly estimateHidden = new HiddenSlot(this.estimate.el as HTMLElement);
  private readonly heading = new TextSlot(h('span', 'hud-micro'));
  private readonly label: AttrSlot;
  private readonly brakeFront = new TextSlot(h('span', 'hud-brakes__front'));
  private readonly brakeRear = new TextSlot(h('span', 'hud-brakes__rear'));
  private readonly brakeFade = new TextSlot(h('span', 'hud-brakes__fade'));
  private readonly brakePanel: HTMLElement;
  private readonly brakesHidden: HiddenSlot;
  private readonly fading: AttrSlot;

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
    this.brakePanel = h('div', 'hud-brakes', { 'data-fade': 'false' }, [
      h('span', 'hud-micro', undefined, ['BRAKES °C']),
      h('span', 'hud-brakes__axle', undefined, ['F ', this.brakeFront.el]),
      h('span', 'hud-brakes__axle', undefined, ['R ', this.brakeRear.el]),
      this.brakeFade.el,
    ]);
    this.fading = new AttrSlot(this.brakePanel, 'data-fade');
    this.brakesHidden = new HiddenSlot(this.brakePanel);
    this.el = h('section', 'hud-panel hud-tyrefuel', { 'aria-label': 'Tyre and fuel estimates' }, [
      h('header', 'hud-panel__head', undefined, [
        h('span', 'hud-micro hud-micro--strong', undefined, ['TYRES · FUEL']),
        this.estimate.el,
      ]),
      h('div', 'hud-tyrefuel__body', undefined, [
        h('div', 'hud-tyres', undefined, [this.heading.el, grid]),
        h('i', 'hud-tyrefuel__rule'),
        fuel,
      ]),
      this.brakePanel,
    ]);
    this.label = new AttrSlot(this.el, 'aria-label');
  }

  update(st: HudState): void {
    const actualTyres = st.tyres && st.tyres.length === 4 ? st.tyres : null;
    const brakes = st.brakes && st.brakes.length === 4 ? st.brakes : null;
    if (!actualTyres || !st.fuel) this.model.update(st);
    this.estimateHidden.set(!!actualTyres && !!st.fuel);
    this.estimate.set(st.fuel && !actualTyres ? 'TYRES EST' : 'EST');
    this.label.set(actualTyres && st.fuel ? brakes ? 'Tyres, brakes and fuel' : 'Tyres and fuel' : st.fuel ? 'Tyre estimates and fuel' : 'Tyre and fuel estimates');
    this.heading.set(actualTyres && st.tyreCompound ? `${st.tyreCompound.toUpperCase()} °C` : 'TYRES °C');
    const tyres = actualTyres ?? this.model.tyres;
    for (let i = 0; i < 4; i++) {
      const t = tyres[i];
      const v = this.tyres[i];
      v.band.set(tyreBand(t.tempC, st.tyreCompound));
      v.temp.set(String(Math.round(t.tempC)));
      v.life.set(Math.max(0, Math.min(1, 1 - t.wear)));
    }
    const fuel = st.fuel ?? this.model.fuel;
    this.litres.set(fuel.litres.toFixed(1));
    const laps = fuel.lapsLeft;
    this.laps.set(laps === null ? '--' : laps >= 99.5 ? '99+' : laps.toFixed(1));
    this.gauge.set(Math.max(0, Math.min(1, fuel.litres / (st.fuel ? FUEL_CAPACITY_L : FUEL_START_L))));
    this.low.set(laps !== null && laps < 2 ? 'true' : 'false');
    this.brakesHidden.set(!brakes);
    if (brakes) {
      this.brakeFront.set(String(Math.round((brakes[0].tempC + brakes[1].tempC) / 2)));
      this.brakeRear.set(String(Math.round((brakes[2].tempC + brakes[3].tempC) / 2)));
      const loss = Math.round(100 * (1 - Math.min(...brakes.map((disc) => disc.forceMultiplier))));
      this.fading.set(loss > 0 ? 'true' : 'false');
      this.brakeFade.set(loss > 0 ? `FADE ${loss}%` : '');
    }
  }
}
