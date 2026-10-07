// DISPLAY-ONLY tyre and fuel estimate. The physics has no tyre-temperature or
// fuel model, so the HUD derives plausible numbers from data it already gets.
// Nothing here feeds back into the simulation. Pure (no DOM): unit-tested.
//
// Clock: the running lap time (lap.currentS) - simulation time, so the model
// stops while paused and resets when the timer restarts (session restart).
// Tyre temperature has two layers: a slow carcass (time constant ~100 s) and a
// fast surface layer (~2 s) on top, so the reading follows corners within a lap
// (outside tyres flare) while the carcass sets the lap-to-lap level.
import { tyreHeat } from '@/hud/tyre-heat';
import type { HudState } from '@/types/hud';

export const FUEL_START_L = 110;
/** E85 V8 estimate: ~3.9 L per 2:05 Bathurst lap at ~65 % full throttle. */
const FUEL_IDLE_LPS = 0.0022;
const FUEL_FULL_LPS = 0.046;
/** A lap shorter than this (teleport, debug skip) is not used for the fuel average. */
const MIN_FULL_LAP_S = 60;
const AMBIENT_C = 22;
/** No tyre warmers in Supercars: cool tyres off the grid. */
const START_C = 52;
/** Carcass cooling per second per degree above ambient: still air + airflow with speed (m/s). */
const COOL_BASE = 0.0036;
const COOL_SPEED = 0.00012;
/** Surface layer: excess = gain x heat input, settling with this time constant. */
const SURFACE_GAIN = 4.5;
const SURFACE_TAU_S = 2;
/** Tread used per C of heat input (~0.7 % per normal lap). */
const WEAR_K = 9e-5;

export interface TyreReading {
  tempC: number;
  /** Tread used, 0 (new) .. 1 (gone). */
  wear: number;
}

export interface FuelReading {
  litres: number;
  /**
   * Laps of fuel left at the average use of complete laps. Null until one full
   * timed lap is done; recomputed only when crossing the line (no flicker).
   */
  lapsLeft: number | null;
}

export type TyreBand = 'cold' | 'warm' | 'ok' | 'hot' | 'over';

/** Colour band of a tyre temperature (slick window ~85-105 C). */
export function tyreBand(tempC: number): TyreBand {
  if (tempC < 70) return 'cold';
  if (tempC < 85) return 'warm';
  if (tempC <= 105) return 'ok';
  if (tempC <= 115) return 'hot';
  return 'over';
}

export class TyreFuelEstimator {
  readonly tyres: TyreReading[] = [0, 1, 2, 3].map(() => ({ tempC: START_C, wear: 0 }));
  readonly fuel: FuelReading = { litres: FUEL_START_L, lapsLeft: null };
  private prevLap = -1;
  private prevT = 0;
  private lapClock = 0;
  private lapStartFuel = FUEL_START_L;
  private usedOnFullLaps = 0;
  private fullLaps = 0;
  private readonly carcass = [START_C, START_C, START_C, START_C];
  private readonly surface = [0, 0, 0, 0];
  private readonly heat = [0, 0, 0, 0];

  reset(): void {
    for (let i = 0; i < 4; i++) {
      this.tyres[i].tempC = START_C;
      this.tyres[i].wear = 0;
      this.carcass[i] = START_C;
      this.surface[i] = 0;
    }
    this.fuel.litres = FUEL_START_L;
    this.fuel.lapsLeft = null;
    this.lapClock = 0;
    this.lapStartFuel = FUEL_START_L;
    this.usedOnFullLaps = 0;
    this.fullLaps = 0;
  }

  /** At the line: fold the lap just finished into the average and refresh laps left. */
  private crossLine(finishedLap: number): void {
    if (finishedLap >= 1 && this.lapClock >= MIN_FULL_LAP_S) {
      this.usedOnFullLaps += this.lapStartFuel - this.fuel.litres;
      this.fullLaps++;
      const perLap = this.usedOnFullLaps / this.fullLaps;
      this.fuel.lapsLeft = perLap > 0.1 ? this.fuel.litres / perLap : null;
    }
    this.lapStartFuel = this.fuel.litres;
    this.lapClock = 0;
  }

  /** Simulation seconds since the previous update, from the lap timer; resets on a timer restart. */
  private clock(st: HudState): number {
    const n = st.lap.number;
    const t = st.lap.currentS;
    const first = this.prevLap < 0;
    const prevLap = this.prevLap;
    const prevT = this.prevT;
    this.prevLap = n;
    this.prevT = t;
    if (first) return 0;
    if (n === prevLap) {
      if (t >= prevT) return Math.min(0.25, t - prevT);
      this.reset();
      return 0;
    }
    if (n === prevLap + 1) {
      this.crossLine(prevLap);
      return Math.min(0.25, t);
    }
    if (n < prevLap) this.reset();
    return 0;
  }

  update(st: HudState): void {
    const dt = this.clock(st);
    const v = st.speedKmh / 3.6;
    if (dt > 0) {
      this.lapClock += dt;
      const burn = (FUEL_IDLE_LPS + FUEL_FULL_LPS * Math.max(0, Math.min(1, st.throttle))) * dt;
      this.fuel.litres = Math.max(0, this.fuel.litres - burn);
      const cool = COOL_BASE + COOL_SPEED * v;
      const heat = tyreHeat(st, v, this.heat);
      const k = Math.min(1, dt / SURFACE_TAU_S);
      for (let i = 0; i < 4; i++) {
        const tyre = this.tyres[i];
        this.carcass[i] += (heat[i] - (this.carcass[i] - AMBIENT_C) * cool) * dt;
        this.surface[i] += (SURFACE_GAIN * heat[i] - this.surface[i]) * k;
        tyre.tempC = this.carcass[i] + this.surface[i];
        const overheat = 1 + Math.max(0, tyre.tempC - 110) / 20;
        tyre.wear = Math.min(1, tyre.wear + WEAR_K * heat[i] * overheat * dt);
      }
    }
  }
}
