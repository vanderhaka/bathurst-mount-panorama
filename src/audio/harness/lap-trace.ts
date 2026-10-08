import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { CAR_SOUND_PROFILES } from '@/audio/dsp/engine-profile';
import { clamp } from '@/audio/dsp/math';
import type { CarAudioFrame, Surface } from '@/types/audio';

interface LapKey {
  t: number;
  speedKmh: number;
  throttle: number;
  slip: number;
  surface: Surface;
  label: string;
}

/** Simplified Bathurst lap (~110 s): straights, braking zones, kerbs and two off-track moments. */
export const LAP_KEYS: readonly LapKey[] = [
  { t: 0, speedKmh: 95, throttle: 1, slip: 0.05, surface: 'asphalt', label: 'Pit Straight' },
  { t: 8, speedKmh: 185, throttle: 1, slip: 0, surface: 'asphalt', label: 'Pit Straight' },
  { t: 13, speedKmh: 200, throttle: 1, slip: 0, surface: 'asphalt', label: 'Pit Straight' },
  { t: 14.5, speedKmh: 198, throttle: 0, slip: 0.1, surface: 'asphalt', label: 'Hell Corner braking' },
  { t: 17, speedKmh: 70, throttle: 0, slip: 0.6, surface: 'asphalt', label: 'Hell Corner braking' },
  { t: 18.5, speedKmh: 72, throttle: 0.3, slip: 0.6, surface: 'kerb', label: 'Hell Corner kerb' },
  { t: 20, speedKmh: 85, throttle: 1, slip: 0.45, surface: 'asphalt', label: 'Mountain Straight' },
  { t: 27, speedKmh: 175, throttle: 1, slip: 0, surface: 'asphalt', label: 'Mountain Straight' },
  { t: 34, speedKmh: 190, throttle: 1, slip: 0, surface: 'asphalt', label: 'Mountain Straight' },
  { t: 35.5, speedKmh: 188, throttle: 0, slip: 0.1, surface: 'asphalt', label: 'Griffins Bend braking' },
  { t: 38, speedKmh: 105, throttle: 0, slip: 0.45, surface: 'asphalt', label: 'Griffins Bend' },
  { t: 40, speedKmh: 135, throttle: 0.8, slip: 0.2, surface: 'asphalt', label: 'Reid Park' },
  { t: 46, speedKmh: 185, throttle: 1, slip: 0, surface: 'asphalt', label: 'Sulman Park' },
  { t: 50, speedKmh: 205, throttle: 1, slip: 0, surface: 'asphalt', label: 'Skyline' },
  { t: 51.5, speedKmh: 196, throttle: 0, slip: 0.05, surface: 'asphalt', label: 'Skyline lift' },
  { t: 53, speedKmh: 140, throttle: 0.6, slip: 0.3, surface: 'asphalt', label: 'The Esses' },
  { t: 56, speedKmh: 112, throttle: 0.4, slip: 0.55, surface: 'asphalt', label: 'The Esses' },
  { t: 58.5, speedKmh: 100, throttle: 0, slip: 0.7, surface: 'asphalt', label: 'The Dipper' },
  { t: 60.5, speedKmh: 58, throttle: 0, slip: 0.65, surface: 'asphalt', label: 'Forest Elbow' },
  { t: 62, speedKmh: 55, throttle: 0.5, slip: 0.8, surface: 'grass', label: 'Forest Elbow (grass)' },
  { t: 64, speedKmh: 62, throttle: 0.6, slip: 0.6, surface: 'grass', label: 'Forest Elbow (grass)' },
  { t: 66, speedKmh: 92, throttle: 1, slip: 0.5, surface: 'asphalt', label: 'Conrod exit' },
  { t: 75, speedKmh: 225, throttle: 1, slip: 0, surface: 'asphalt', label: 'Conrod Straight' },
  { t: 85, speedKmh: 278, throttle: 1, slip: 0, surface: 'asphalt', label: 'Conrod Straight' },
  { t: 89, speedKmh: 288, throttle: 1, slip: 0, surface: 'asphalt', label: 'Conrod Straight' },
  { t: 90.5, speedKmh: 284, throttle: 0, slip: 0.1, surface: 'asphalt', label: 'The Chase braking' },
  { t: 94, speedKmh: 108, throttle: 0, slip: 0.55, surface: 'asphalt', label: 'The Chase braking' },
  { t: 95.5, speedKmh: 105, throttle: 0.5, slip: 0.4, surface: 'kerb', label: 'The Chase kerbs' },
  { t: 98, speedKmh: 96, throttle: 0.8, slip: 0.45, surface: 'asphalt', label: 'Murray’s approach' },
  { t: 100, speedKmh: 112, throttle: 0, slip: 0.7, surface: 'asphalt', label: 'Murray’s braking' },
  { t: 102, speedKmh: 84, throttle: 0.5, slip: 0.6, surface: 'gravel', label: 'Murray’s (gravel)' },
  { t: 103.8, speedKmh: 86, throttle: 0.6, slip: 0.5, surface: 'gravel', label: 'Murray’s (gravel)' },
  { t: 105, speedKmh: 92, throttle: 1, slip: 0.3, surface: 'asphalt', label: 'Pit Straight' },
  { t: 110, speedKmh: 95, throttle: 1, slip: 0.05, surface: 'asphalt', label: 'Pit Straight' },
];

export const LAP_SECONDS = LAP_KEYS[LAP_KEYS.length - 1].t;
const UPSHIFT_RPM = 7150;
const DOWNSHIFT_RPM = 4200;

function smooth(a: number, b: number, u: number): number {
  const s = 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
  return a + (b - a) * s;
}

export interface LapState {
  frame: CarAudioFrame;
  label: string;
}

/** Drives CarAudioFrame values around the lap: auto gearbox, shift events, limiter bounce. */
export class LapSimulator {
  private gear = 1;
  private rpm: number;
  private readonly spec;
  private readonly idle: number;
  private readonly limiter: number;
  private started = false;

  constructor(kind: CarKind) {
    this.spec = CAR_SPECS[kind];
    this.idle = CAR_SOUND_PROFILES[kind].idleRpm;
    this.limiter = CAR_SOUND_PROFILES[kind].limiterRpm;
    this.rpm = this.idle;
  }

  private rpmIn(gear: number, speedKmh: number): number {
    const wheelRevS = speedKmh / 3.6 / (2 * Math.PI * this.spec.dimensions.wheelRadius);
    return wheelRevS * this.spec.gearRatios[gear - 1] * this.spec.finalDrive * 60;
  }

  /** `lapT` in seconds (wraps), `dt` seconds since the previous call. */
  step(lapT: number, dt: number, interior: number): LapState {
    const t = ((lapT % LAP_SECONDS) + LAP_SECONDS) % LAP_SECONDS;
    let i = 0;
    while (i < LAP_KEYS.length - 2 && LAP_KEYS[i + 1].t <= t) i++;
    const a = LAP_KEYS[i];
    const b = LAP_KEYS[i + 1];
    const u = (t - a.t) / (b.t - a.t);
    const speed = smooth(a.speedKmh, b.speedKmh, u);
    const throttle = smooth(a.throttle, b.throttle, u);
    const slip = smooth(a.slip, b.slip, u);

    if (!this.started) {
      this.started = true;
      this.gear = 1;
      while (this.gear < 6 && this.rpmIn(this.gear, speed) > 6800) this.gear++;
    }
    let shifted = false;
    if (this.rpmIn(this.gear, speed) > UPSHIFT_RPM && this.gear < 6) {
      this.gear++;
      shifted = true;
    } else if (this.rpmIn(this.gear, speed) < DOWNSHIFT_RPM && this.gear > 1 && this.rpmIn(this.gear - 1, speed) < 7000) {
      this.gear--;
      shifted = true;
    }
    const target = Math.max(this.idle, this.rpmIn(this.gear, speed));
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / 0.05));
    const atLimit = target > this.limiter - 40 && throttle > 0.9;
    const rpm = atLimit ? this.limiter - 60 - 90 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 11 * t)) : this.rpm;
    return {
      label: a.label,
      frame: {
        rpm,
        load: throttle < 0.1 ? 0.05 : throttle,
        throttle,
        speedKmh: speed,
        gear: this.gear,
        onLimiter: atLimit,
        slip,
        scrub: Math.min(1, slip * 1.5),
        surface: a.surface,
        interior,
        shifted,
      },
    };
  }
}
