/** Research: 132 L tank; 1340 kg dry + 80 L at 0.75 kg/L = today's calibrated 1400 kg. */
export const FUEL_CAPACITY_L = 132;
export const FUEL_REFERENCE_L = 80;
export const FUEL_KG_PER_L = 0.75;
/** Estimated E75 consumption, inherited from the HUD calibration (~4 L/125 s). */
const IDLE_LPS = 0.0022;
const FULL_LPS = 0.046;
const MIN_LAP_S = 60;

export interface FuelReading { litres: number; lapsLeft: number | null }

export function fuelMassKg(litres: number): number {
  return Math.max(0, Math.min(FUEL_CAPACITY_L, Number.isFinite(litres) ? litres : 0)) * FUEL_KG_PER_L;
}

/** Fixed-step simulation state; the HUD reads these values without advancing them. */
export class FuelModel implements FuelReading {
  litres = FUEL_REFERENCE_L;
  lapsLeft: number | null = null;
  private lapStartL = FUEL_REFERENCE_L;
  private lapS = 0;
  private usedL = 0;
  private fullLaps = 0;

  massKg(referenceMassKg: number): number {
    return referenceMassKg - fuelMassKg(FUEL_REFERENCE_L) + fuelMassKg(this.litres);
  }

  reset(litres = FUEL_REFERENCE_L): void {
    this.litres = fuelMassKg(litres) / FUEL_KG_PER_L;
    this.lapsLeft = null;
    this.usedL = this.fullLaps = 0;
    this.cancelLap();
  }

  /** Teleports invalidate the consumption sample while preserving tank contents. */
  cancelLap(): void {
    this.lapStartL = this.litres;
    this.lapS = 0;
  }

  advance(throttle: number, dt: number): void {
    if (!(Number.isFinite(dt) && dt > 0)) return;
    const pedal = Math.max(0, Math.min(1, Number.isFinite(throttle) ? throttle : 0));
    this.litres = Math.max(0, this.litres - (IDLE_LPS + FULL_LPS * pedal) * dt);
    this.lapS += dt;
  }

  crossLine(): void {
    if (this.lapS >= MIN_LAP_S) {
      this.usedL += this.lapStartL - this.litres;
      this.fullLaps++;
      const perLap = this.usedL / this.fullLaps;
      this.lapsLeft = perLap > 0.1 ? this.litres / perLap : null;
    }
    this.cancelLap();
  }
}
