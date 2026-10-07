// Attract mode: the AI car that laps the mountain behind the title screen (race
// cameras follow it) and the car that stands on the grid on the car-select screen
// (the camera orbits it).
import type * as THREE from 'three';
import type { CarEntity } from '@/game/car-entity';
import { orbitCamera } from '@/game/debug-tools';
import { Autopilot } from '@/race/autopilot';
import { SessionProfiles } from '@/game/session-profiles';
import type { RacingLine } from '@/track/racing-line';

export class AttractMode {
  private demo: { entity: CarEntity; pilot: Autopilot; profiles: SessionProfiles } | null = null;
  private orbitAngle = 0.9;

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {}

  get model() { return this.demo?.entity.model ?? null; }

  /** Replaces the demo car (the entity's model must already be in the scene). */
  set(entity: CarEntity, line: RacingLine): void {
    this.drop();
    entity.vehicle.stint.reset();
    const profiles = new SessionProfiles(entity.vehicle, line);
    this.demo = { entity, pilot: new Autopilot(entity.vehicle.track, line, profiles.ai), profiles };
  }

  drop(): void {
    if (!this.demo) return;
    this.scene.remove(this.demo.entity.model.root);
    this.demo.entity.model.dispose();
    this.demo = null;
  }

  /** `driving`: the AI laps and `follow` aims the race cameras; else the car stands and the camera orbits it. */
  frame(dt: number, driving: boolean, follow: (entity: CarEntity, dt: number) => void, focus: THREE.Vector3): void {
    if (!this.demo) return;
    const { entity, pilot, profiles } = this.demo;
    if (driving) {
      const v = entity.vehicle;
      entity.simulate(pilot.drive(v, { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false }), dt, (input) => {
        if (v.stint.completedLaps > 0) {
          v.stint.reset();
          v.stint.placeOnTrack(v.tp.s);
          profiles.reset();
        }
        profiles.update();
        pilot.drive(v, input);
      });
      entity.sync(dt);
      follow(entity, dt);
      return;
    }
    entity.sync(dt);
    this.orbitAngle += dt * 0.16;
    orbitCamera(this.camera, entity.model.root.position, this.orbitAngle);
    focus.copy(entity.model.root.position);
  }
}
