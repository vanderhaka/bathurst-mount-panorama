// Attract mode: the AI car that laps the mountain behind the title screen (race
// cameras follow it) and the car that stands on the grid on the car-select screen
// (the camera orbits it).
import type * as THREE from 'three';
import type { CarEntity } from '@/game/car-entity';
import { orbitCamera } from '@/game/debug-tools';
import type { Autopilot } from '@/race/autopilot';

export class AttractMode {
  private demo: { entity: CarEntity; pilot: Autopilot } | null = null;
  private orbitAngle = 0.9;

  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {}

  get model() { return this.demo?.entity.model ?? null; }

  /** Replaces the demo car (the entity's model must already be in the scene). */
  set(entity: CarEntity, pilot: Autopilot): void {
    this.drop();
    this.demo = { entity, pilot };
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
    const { entity, pilot } = this.demo;
    if (driving) {
      entity.simulate(pilot.drive(entity.vehicle, { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false }), dt);
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
