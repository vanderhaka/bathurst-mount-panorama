import { impactSeverity } from '@/physics/damage';
import type { WheelTelemetry } from '@/physics/types';

type Pulse = (milliseconds: number) => boolean;
type Contact = Pick<WheelTelemetry, 'surface' | 'load'>;
const COOLDOWN_MS = 200;

function browserPulse(): Pulse | null {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' ? navigator.vibrate.bind(navigator) : null;
}

/** Short phone feedback from physics contacts; unsupported browsers stay quiet. */
export class PhoneVibration {
  private enabled = true;
  private nextAt = -Infinity;
  private activeUntil = -Infinity;

  constructor(private readonly pulse: Pulse | null = browserPulse(), private readonly now: () => number = () => performance.now()) {}

  setEnabled(enabled: boolean): void {
    if (this.enabled && !enabled && this.now() < this.activeUntil) {
      try { this.pulse?.(0); } catch { /* Unsupported or blocked vibration. */ }
      this.activeUntil = -Infinity;
    }
    this.enabled = enabled;
  }

  kerb(wheels: ReadonlyArray<Contact>, speed: number): boolean {
    if (!Number.isFinite(speed) || Math.abs(speed) <= 8 || !wheels.some((w) => w.surface === 'kerb' && w.load > 0)) return false;
    return this.send(18);
  }

  /** Called only for reports returned by the car's actual collision step. */
  impact(speed: number): boolean {
    if (!Number.isFinite(speed) || speed <= 2) return false;
    return this.send(Math.round(25 + 35 * impactSeverity(speed)));
  }

  private send(milliseconds: number): boolean {
    if (!this.enabled || !this.pulse) return false;
    const time = this.now();
    if (time < this.nextAt) return false;
    // An API blocked by the browser must not be retried every frame either.
    this.nextAt = time + COOLDOWN_MS;
    try {
      const accepted = this.pulse(milliseconds);
      if (accepted) this.activeUntil = time + milliseconds;
      return accepted;
    } catch { return false; }
  }
}
