export interface DiscThermalSpec { capacityJPerC: number; coolingBase: number; coolingSpeed: number }
export interface BrakeReading { tempC: number; forceMultiplier: number; energyJ: number }

export const BRAKE_AMBIENT_C = 22;
export const BRAKE_FADE_START_C = 700;
export const BRAKE_FADE_FULL_C = 1000;
/** Effective rotor/pad capacities and airflow are game estimates; Gen3 values are unpublished. */
export const DISC_THERMAL: Readonly<Record<'front' | 'rear', Readonly<DiscThermalSpec>>> = {
  front: { capacityJPerC: 5500, coolingBase: 0.006, coolingSpeed: 0.00016 },
  rear: { capacityJPerC: 4300, coolingBase: 0.007, coolingSpeed: 0.00018 },
};
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));

/** AP Racing recommends 400–600°C bulk operation; this higher fade knee is a game estimate. */
export function brakeFade(tempC: number): number {
  const x = clamp((tempC - BRAKE_FADE_START_C) / (BRAKE_FADE_FULL_C - BRAKE_FADE_START_C), 0, 1);
  return 1 - 0.4 * x * x * (3 - 2 * x);
}

export function brakeGlow(tempC: number): number { return clamp((tempC - 480) / 350, 0, 1); }

/** Four independent discs, advanced only by fixed-step delivered caliper work (W × s = J). */
export class BrakeModel {
  readonly discs: BrakeReading[] = [0, 1, 2, 3].map(() => ({ tempC: BRAKE_AMBIENT_C, forceMultiplier: 1, energyJ: 0 }));

  constructor(tempC = BRAKE_AMBIENT_C) { this.reset(tempC); }

  reset(tempC = BRAKE_AMBIENT_C): void {
    const temp = clamp(tempC, BRAKE_AMBIENT_C, 1200);
    for (const disc of this.discs) Object.assign(disc, { tempC: temp, forceMultiplier: brakeFade(temp), energyJ: 0 });
  }

  /** With `fade` false the discs heat and cool as usual but never lose braking force. */
  advance(wheel: number, powerW: number, speed: number, dt: number, fade = true): void {
    const disc = this.discs[wheel];
    if (!disc || !(Number.isFinite(dt) && dt > 0)) return;
    const spec = wheel < 2 ? DISC_THERMAL.front : DISC_THERMAL.rear;
    const power = Math.max(0, Number.isFinite(powerW) ? powerW : 0), v = Number.isFinite(speed) ? Math.abs(speed) : 0;
    const k = spec.coolingBase + spec.coolingSpeed * v;
    // Exact solution for constant power/airflow over a step; no frame-dependent Euler cooling.
    const equilibriumRise = power / (spec.capacityJPerC * k);
    const rise = (disc.tempC - BRAKE_AMBIENT_C - equilibriumRise) * Math.exp(-k * dt) + equilibriumRise;
    disc.tempC = clamp(BRAKE_AMBIENT_C + rise, BRAKE_AMBIENT_C, 1200);
    disc.energyJ += power * dt;
    disc.forceMultiplier = fade ? brakeFade(disc.tempC) : 1;
  }
}
