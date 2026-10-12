import type { Particles } from '@/fx/particles';
import type { OpponentField } from '@/game/opponent-field';
import { applyImpactDamage } from '@/physics/damage';
import type { ImpactReport } from '@/physics/types';
import type { CarHit } from '@/race/field/car-contact';
import { HIT_MIN_MPS, hitReport } from '@/race/field/field-rules';

/**
 * What a step's car-to-car contacts do to the cars: dents for every car involved, sparks for hits between AI cars,
 * and for the player the same feedback as a wall impact (`onPlayerHit`: sparks, rumble, shake, audio) plus damage by
 * the player's damage setting. Touches below HIT_MIN_MPS do nothing visible.
 */
export function applyCarHits(hits: readonly CarHit[], field: OpponentField, particles: Particles, onPlayerHit: (imp: ImpactReport) => void): void {
  const me = field.playerIndex;
  for (const hit of hits) {
    if (hit.speed < HIT_MIN_MPS) continue;
    if (hit.a !== me && hit.b !== me) {
      const sev = Math.min(1, hit.speed / 20);
      for (let q = 0; q < 4 + sev * 20; q++) particles.emit('spark', hit.x, hit.y, hit.z, 0, 0, 0);
    }
    for (const side of [hit.a, hit.b]) {
      const imp = hitReport(hit, side);
      const entity = side === me ? field.playerEntity : field.entities[side];
      entity.applyCarHit(imp);
      if (side !== me) continue;
      if (entity.vehicle.assists.mechanicalDamage) applyImpactDamage(entity.vehicle, imp);
      onPlayerHit(imp);
    }
  }
}
