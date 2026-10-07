import { smoothstep } from '@/audio/dsp/math';
import type { Rng } from '@/audio/dsp/rng';

export interface PopEvent {
  /** Seconds from now. */
  delay: number;
  /** 0..1 loudness. */
  level: number;
  /** 0 = crackle, 1 = pop, 2 = bang. */
  size: 0 | 1 | 2;
}

export interface PopInput {
  rpm: number;
  throttle: number;
  onLimiter: boolean;
  idleRpm: number;
  limiterRpm: number;
}

const MAX_OVERRUN_RATE = 16;
const MAX_LIMITER_RATE = 6;
const LIFT_THROTTLE = 0.12;

/**
 * Decides when the exhaust spits. Lifting off at high rpm gives one bang then a
 * decaying burble of pops and crackles; the rev limiter adds sparse spits. Pure
 * logic with an injected RNG so it is deterministic under test.
 */
export class OverrunPopper {
  private sinceLift = 99;
  private prevThrottle = 0;

  constructor(private readonly rng: Rng) {}

  /** Appends this frame's pops to `out`. */
  step(dt: number, i: PopInput, out: PopEvent[]): void {
    const lifted = i.throttle < LIFT_THROTTLE;
    const rpmFactor = smoothstep(3000, 6800, i.rpm);
    if (this.prevThrottle > 0.6 && lifted && i.rpm > 5200) {
      out.push({ delay: 0.03, level: 0.7 + 0.3 * rpmFactor, size: 2 });
    }
    this.sinceLift = lifted ? this.sinceLift + dt : 0;
    this.prevThrottle = i.throttle;

    if (lifted && this.sinceLift > 0.08 && i.rpm > i.idleRpm + 1200) {
      const decay = Math.exp(-this.sinceLift / 1.8);
      const rate = MAX_OVERRUN_RATE * rpmFactor * (0.12 + 0.88 * decay);
      if (this.rng() < 1 - Math.exp(-rate * dt)) this.emitPop(rpmFactor, out);
    }
    if (i.onLimiter && i.throttle > 0.5 && this.rng() < 1 - Math.exp(-MAX_LIMITER_RATE * dt)) {
      out.push({ delay: this.rng() * 0.03, level: 0.3 + 0.35 * this.rng(), size: 0 });
    }
  }

  private emitPop(rpmFactor: number, out: PopEvent[]): void {
    const level = (0.25 + 0.75 * Math.pow(this.rng(), 1.5)) * (0.4 + 0.6 * rpmFactor);
    const size = level > 0.7 ? 2 : level > 0.4 ? 1 : 0;
    out.push({ delay: this.rng() * 0.016, level, size });
    if (this.rng() < 0.4) out.push({ delay: 0.05 + 0.06 * this.rng(), level: level * 0.6, size: 0 });
  }
}
