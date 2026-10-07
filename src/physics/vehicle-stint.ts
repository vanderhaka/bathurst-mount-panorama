import { FuelModel, FUEL_REFERENCE_L } from '@/physics/fuel';
import type { VehicleTelemetry } from '@/physics/types';

export interface StintStart { fuelL?: number }

/** Owned by one Vehicle, advanced only from fixed physics steps. */
export class VehicleStint {
  readonly fuel = new FuelModel();
  completedLaps = 0;
  private previousS: number | null = null;

  reset(start: StintStart = {}): void {
    this.fuel.reset(start.fuelL ?? FUEL_REFERENCE_L);
    this.completedLaps = 0;
    this.previousS = null;
  }

  /** Recovery preserves tank contents and abandons this lap's consumption sample. */
  placeOnTrack(s: number): void {
    this.previousS = s;
    this.fuel.cancelLap();
  }

  advance(t: VehicleTelemetry, dt: number, s: number, lineS: number, enginePedal = t.throttle): void {
    if (!(Number.isFinite(dt) && dt > 0)) return;
    const prev = this.previousS;
    if (prev !== null && prev < lineS && s >= lineS && s - prev < 50) {
      this.fuel.crossLine();
      this.completedLaps++;
    }
    this.previousS = s;
    this.fuel.advance(enginePedal, dt);
  }
}
