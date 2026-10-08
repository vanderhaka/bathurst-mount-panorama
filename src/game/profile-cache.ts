// Racing-line speed profiles per car: the player's line (LINE_PROFILE, shown as the
// racing line and corner-speed hints) and the AI driver's (AI_PROFILE). Both follow
// the handling tuner: the cache key holds the values that change the car's limits.
import { circuitCarSpec, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, getHandling, tunedSpec, type HandlingConfig } from '@/config/handling';
import { AI_PROFILE } from '@/race/autopilot';
import { computeSpeedProfile, LINE_PROFILE, type SpeedProfile } from '@/track/speed-profile';
import type { World } from '@/world/world';

export interface CarProfiles {
  player: SpeedProfile;
  ai: SpeedProfile;
}

function limitsKey(h: Readonly<HandlingConfig>): string {
  return `${h.grip}|${h.rearGrip}|${h.downforce}`;
}

export class ProfileCache {
  private readonly cache = new Map<string, CarProfiles>();

  constructor(private readonly world: () => World) {}

  /** Profiles for a car with the current handling values (computed once per combination). */
  get(car: CarKind): CarProfiles {
    const h = getHandling();
    const key = `${car}|${limitsKey(h)}`;
    let p = this.cache.get(key);
    if (!p) {
      const { track, line, profile } = this.world();
      const spec = tunedSpec(circuitCarSpec(car, track.id), h);
      // The world holds the Camaro's line profile for the default handling (world.ts).
      const reuse = car === 'camaro' && limitsKey(h) === limitsKey(DEFAULT_HANDLING);
      p = {
        player: reuse ? profile : computeSpeedProfile(track, line, spec, LINE_PROFILE),
        ai: computeSpeedProfile(track, line, spec, AI_PROFILE),
      };
      this.cache.set(key, p);
    }
    return p;
  }
}
