import type { SurfaceKind } from '@/track/track-query';

export interface FlatSpotReading { severity: number; gripMultiplier: number }
export const FLAT_SPOT_MIN_SPEED = 12;
export const FLAT_SPOT_MIN_USE = 1.1;
const LOCK_DWELL_S = 0.12, DAMAGE_PER_METRE = 0.006;
const unit = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/** Severity, loss and vibration scale are estimates; no Gen3 flat-spot measurements are published. */
export function flatSpotGrip(severity: number): number { return 1 - 0.18 * unit(severity); }

/** Metres of body vibration at tyre rotation frequency; phase comes from simulated wheel spin. */
export function flatSpotVibration(severity: number, spin: number, speed: number): number {
  if (!Number.isFinite(spin) || !Number.isFinite(speed)) return 0;
  return 0.0024 * unit(severity) * unit(Math.abs(speed) / 12) * Math.sin(spin);
}

export class FlatSpots {
  readonly tyres: FlatSpotReading[] = [0, 1, 2, 3].map(() => ({ severity: 0, gripMultiplier: 1 }));
  private readonly lockTime = new Float64Array(4);

  /** Call only when fitting fresh tyres (or starting a new race), never on recovery/cooling. */
  fit(): void {
    this.lockTime.fill(0);
    for (const tyre of this.tyres) Object.assign(tyre, { severity: 0, gripMultiplier: 1 });
  }

  /** With `wear` false no flat spot forms, and the lock-time count restarts. */
  advance(wheel: number, lockUse: number, speed: number, loadN: number, surface: SurfaceKind, dt: number, wear = true): void {
    const tyre = this.tyres[wheel];
    if (!tyre || !(Number.isFinite(dt) && dt > 0)) return;
    if (!wear) { this.lockTime[wheel] = 0; return; }
    const hardSurface = surface === 'road' || surface === 'kerb' || surface === 'asphalt' || surface === 'concrete';
    const locked = Number.isFinite(lockUse) && Number.isFinite(speed) && Number.isFinite(loadN)
      && lockUse >= FLAT_SPOT_MIN_USE && Math.abs(speed) >= FLAT_SPOT_MIN_SPEED && loadN >= 500 && hardSurface;
    if (!locked) { this.lockTime[wheel] = 0; return; }
    const previous = this.lockTime[wheel], elapsed = previous + dt;
    this.lockTime[wheel] = elapsed;
    const damagingTime = Math.max(0, elapsed - LOCK_DWELL_S) - Math.max(0, previous - LOCK_DWELL_S);
    const slide = Math.min(2, lockUse) - FLAT_SPOT_MIN_USE;
    tyre.severity = unit(tyre.severity + damagingTime * Math.abs(speed) * slide * DAMAGE_PER_METRE);
    tyre.gripMultiplier = flatSpotGrip(tyre.severity);
  }

  vibration(spinAngles: readonly number[], speed: number): number {
    return this.tyres.reduce((sum, tyre, w) => sum + flatSpotVibration(tyre.severity, spinAngles[w] ?? 0, speed), 0) / 4;
  }
}
