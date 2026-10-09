import * as THREE from 'three';
import type { Vehicle } from '@/physics/vehicle';
import type { CarModel } from '@/types/car-model';
import { conrodHump, EffectEmission, type EffectSettings } from '@/fx/effect-emission';
import { floorContact, type FloorContact } from '@/fx/floor-contact';
import type { Particles } from '@/fx/particles';
import { createTrackPoint, heightAt, projectToTrack } from '@/track/track-query';

export interface EffectCar { vehicle: Vehicle; model: Pick<CarModel, 'root' | 'exhausts'> }

/** One state per physical car. Call after car.sync; ghosts should never emit. */
export class CarEffects {
  private readonly emission: EffectEmission;
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly wheel: [number, number] = [0, 0];
  private readonly tp = createTrackPoint();
  private readonly floor: FloorContact = { clearance: Infinity, x: 0, y: 0, z: 0 };

  constructor(options: Partial<EffectSettings> = {}) { this.emission = new EffectEmission(options); }
  configure(options: Partial<EffectSettings>): void { this.emission.configure(options); }
  reset(): void { this.emission.reset(); }
  snapshot() { return this.emission.snapshot(); }

  step(car: EffectCar, particles: Particles, dt: number): void {
    if (!(dt > 0)) return;
    const v = car.vehicle;
    this.floor.clearance = Infinity;
    if (conrodHump(v.tp.s) && v.speed >= 72 && !v.telemetry.airborne) floorContact(v, this.floor, car.model.root);
    const plan = this.emission.step({ gear: v.pt.gear, rpm: v.pt.rpm, redline: v.spec.engine.redlineRpm, throttle: v.telemetry.throttle, speed: v.speed, s: v.tp.s, airborne: v.telemetry.airborne, floorClearance: this.floor.clearance, wheels: v.wheels }, dt);
    for (const e of plan.wheels) {
      v.wheelWorld(e.wheel, this.wheel); projectToTrack(v.track, ...this.wheel, v.tp.index, this.tp);
      const y = heightAt(v.track, this.tp.index, this.tp.t, this.tp.d) + 0.03;
      for (let i = 0; i < e.count; i++) particles.emit(e.kind, this.wheel[0], y, this.wheel[1], v.vx, v.vy, v.vz, e.intensity);
    }
    if (plan.flame) {
      car.model.root.updateMatrixWorld(true);
      for (const anchor of car.model.exhausts) {
        anchor.getWorldPosition(this.point); anchor.getWorldDirection(this.direction);
        for (let i = 0; i < plan.flame; i++) particles.emit('flame', this.point.x, this.point.y, this.point.z, v.vx, v.vy, v.vz, (plan.reason === 'downshift' ? 1 : 0.8) * plan.intensity, this.direction);
      }
    }
    for (let i = 0; i < plan.sparks; i++) particles.emit('spark', this.floor.x, this.floor.y, this.floor.z, v.vx, v.vy, v.vz, plan.intensity);
  }
}
