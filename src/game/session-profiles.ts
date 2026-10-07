import { tunedSpec } from '@/config/handling';
import { stintSpec } from '@/physics/stint-spec';
import type { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE } from '@/race/autopilot';
import type { RacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE, type SpeedProfile } from '@/track/speed-profile';

/** Owned per race/demo; no vehicle can alter the world or another car's cached limits. */
export class SessionProfiles {
  readonly player: SpeedProfile;
  readonly ai: SpeedProfile;
  private refreshedS: number;

  constructor(private readonly vehicle: Vehicle, private readonly line: RacingLine) {
    const spec = this.spec();
    this.player = computeSpeedProfile(vehicle.track, line, spec, LINE_PROFILE);
    this.ai = computeSpeedProfile(vehicle.track, line, spec, AI_PROFILE);
    this.refreshedS = vehicle.simulationS;
  }

  private spec() { return stintSpec(tunedSpec(this.vehicle.spec, this.vehicle.handling), this.vehicle.stint); }

  /** Render time and pauses cannot advance the refresh clock. */
  update(): void {
    if (this.vehicle.simulationS - this.refreshedS < 1 - 1e-9) return;
    this.reset();
  }

  /** New stint: recompute immediately while keeping every reader's object/array references. */
  reset(): void {
    const spec = this.spec();
    for (const [target, options] of [[this.player, LINE_PROFILE], [this.ai, AI_PROFILE]] as const) {
      const next = computeSpeedProfile(this.vehicle.track, this.line, spec, options);
      target.speed.set(next.speed);
      target.cornerLimit.set(next.cornerLimit);
      target.lapTimeS = next.lapTimeS;
      target.topSpeed = next.topSpeed;
    }
    this.refreshedS = this.vehicle.simulationS;
  }
}
