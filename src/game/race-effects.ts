import type * as THREE from 'three';
import { QUALITY } from '@/config/graphics';
import { CarEffects } from '@/fx/car-effects';
import { Marbles } from '@/fx/marbles';
import type { CarEntity } from '@/game/car-entity';
import type { Particles } from '@/fx/particles';
import type { EffectSettings } from '@/fx/effect-emission';
import type { QualityPreset } from '@/render/renderer';
import type { World } from '@/world/world';

/** Marble draw distance (m) per tier; low has no marbles. */
const MARBLE_DISTANCE: Record<QualityPreset, number> = { low: 100, medium: 80, high: 100 };

/**
 * The race's visual effects: one CarEffects for the one simulated car (the ghost never emits) and the
 * rubber marbles of the current world. Particles belong to the Game; the marbles are rebuilt per world.
 */
export class RaceEffects {
  private readonly car = new CarEffects();
  private marbles: Marbles;

  constructor(private readonly scene: THREE.Scene, private world: Pick<World, 'track' | 'line'>, private readonly particles: Particles, quality: QualityPreset) {
    this.marbles = this.makeMarbles();
    this.applyQuality(quality);
  }

  /** Tier table: particle capacity, marble count and distance. */
  applyQuality(quality: QualityPreset): void {
    const tier = QUALITY[quality];
    this.particles.configure({ capacity: tier.particleCapacity });
    this.marbles.configure({ enabled: tier.marbleCount > 0, count: tier.marbleCount, distance: MARBLE_DISTANCE[quality] });
  }

  /** The world was rebuilt (tier, tuner): the marbles follow its track and line. */
  setWorld(world: Pick<World, 'track' | 'line'>, quality: QualityPreset): void {
    this.marbles.dispose();
    this.world = world;
    this.marbles = this.makeMarbles();
    this.applyQuality(quality);
  }

  /** Live effect settings (intensity 0..2, flames, ...), for the tuner. */
  configure(options: Partial<EffectSettings>): void {
    this.car.configure(options);
  }

  step(car: CarEntity, dt: number): void {
    if (!(dt > 0)) return;
    this.car.step(car, this.particles, dt);
    this.marbles.update(car.vehicle.tp.s);
  }

  /** The car was put somewhere else: no flame or smoke state carries over. */
  resetCar(): void { this.car.reset(); }

  /** Full restart: the car and every live particle. */
  resetAll(): void { this.car.reset(); this.particles.reset(); }

  dispose(): void { this.marbles.dispose(); }

  private makeMarbles(): Marbles {
    return new Marbles(this.scene, this.world.track, this.world.line, { enabled: false });
  }
}
