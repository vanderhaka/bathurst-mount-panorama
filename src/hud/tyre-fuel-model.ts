// Harness fallback: the game supplies simulation-owned readings through HudState.
// This adapter shares the physics helpers; it never changes a Vehicle.
import { FuelModel, FUEL_REFERENCE_L } from '@/physics/fuel';
import { TyreModel, TYRE_COMPOUNDS, type TyreCompound } from '@/physics/tyre-state';
import type { HudState } from '@/types/hud';

export const FUEL_START_L = FUEL_REFERENCE_L;
export type { FuelReading } from '@/physics/fuel';
export type { TyreReading } from '@/physics/tyre-state';
export type TyreBand = 'cold' | 'warm' | 'ok' | 'hot' | 'over';

/** Presentation bands follow the fitted compound's working window. */
export function tyreBand(tempC: number, compound: TyreCompound = 'soft'): TyreBand {
  const { minC, maxC } = TYRE_COMPOUNDS[compound];
  if (tempC < minC - 15) return 'cold';
  if (tempC < minC) return 'warm';
  if (tempC <= maxC) return 'ok';
  if (tempC <= maxC + 10) return 'hot';
  return 'over';
}

export class TyreFuelEstimator {
  private readonly model = new TyreModel();
  readonly tyres = this.model.tyres;
  readonly fuel = new FuelModel();
  private prevLap = -1;
  private prevT = 0;

  reset(): void {
    this.model.fit();
    this.fuel.reset();
  }

  private clock(st: HudState): number {
    const n = st.lap.number, t = st.lap.currentS;
    const prevLap = this.prevLap, prevT = this.prevT;
    this.prevLap = n;
    this.prevT = t;
    if (prevLap < 0) return 0;
    if (n === prevLap) {
      if (t >= prevT) return Math.min(0.25, t - prevT);
      this.reset();
      return 0;
    }
    if (n === prevLap + 1) {
      if (prevLap >= 1) this.fuel.crossLine();
      else this.fuel.cancelLap();
      return Math.min(0.25, t);
    }
    if (n < prevLap) this.reset();
    return 0;
  }

  update(st: HudState): void {
    const dt = this.clock(st);
    this.fuel.advance(st.throttle, dt);
    this.model.advance(st, st.speedKmh / 3.6, dt);
  }
}
