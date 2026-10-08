import * as THREE from 'three';
import type { CarKind, CarSpec } from '@/car/car-specs';
import { getGraphics } from '@/config/graphics';
import { brakeGlow } from '@/physics/brake-heat';
import { impactLocal, impactSeverity } from '@/physics/damage';
import type { ImpactReport, VehicleInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import type { KerbLayout } from '@/track/kerbs';
import type { Track } from '@/track/track-model';
import type { CarModel, CreateCarModel, Livery } from '@/types/car-model';

/** Pose snapshot used to interpolate rendering between physics steps. */
interface Pose { x: number; y: number; z: number; heading: number; pitch: number; roll: number }

const PHYS_DT = 1 / 360;

/**
 * One drivable car: the physics vehicle, its 3D model and the glue between them
 * (fixed-step simulation with render interpolation, wheels, lights, damage).
 */
export class CarEntity {
  readonly vehicle: Vehicle;
  readonly model: CarModel;
  /** Local body heave from tyre damage as applied to the body, separated from physical suspension pose. */
  flatSpotHeave = 0;
  /** False = impacts do not dent the body (damage setting "Off"). */
  visualDamage = true;
  private acc = 0;
  private prev: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  private cur: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  private readonly spins = [0, 0, 0, 0];
  private readonly impacts: ImpactReport[] = [];
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(spec: CarSpec, track: Track, kerbs: KerbLayout, createModel: CreateCarModel, readonly livery: Livery) {
    this.vehicle = new Vehicle(spec, track, kerbs);
    this.model = createModel(spec.kind as CarKind, { livery, detail: 'high' });
    this.model.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  reset(s: number, d: number): void {
    this.vehicle.reset(s, d);
    this.capture(this.prev);
    this.capture(this.cur);
    this.acc = 0;
    this.sync(0);
  }

  private capture(p: Pose): void {
    const v = this.vehicle;
    p.x = v.x; p.y = v.y; p.z = v.z; p.heading = v.heading; p.pitch = v.pitch; p.roll = v.roll;
  }

  /** Runs physics for `dt` seconds of game time. Returns wall impacts that happened. */
  simulate(input: VehicleInput, dt: number, perStep?: (input: VehicleInput) => void): ImpactReport[] {
    this.impacts.length = 0;
    this.acc += Math.min(dt, 0.1);
    let first = true;
    while (this.acc >= PHYS_DT) {
      perStep?.(input);
      this.capture(this.prev);
      const step = { ...input, shiftUp: first && input.shiftUp, shiftDown: first && input.shiftDown };
      first = false;
      for (const imp of this.vehicle.step(step, PHYS_DT)) this.impacts.push(imp);
      this.capture(this.cur);
      this.acc -= PHYS_DT;
    }
    if (this.visualDamage) for (const imp of this.impacts) this.applyVisualDamage(imp);
    return this.impacts;
  }

  /** Updates the 3D model from the interpolated physics state. `heaveScale` (0..1) scales only the synthetic flat-spot heave. */
  sync(_dt: number, heaveScale = 1): void {
    const a = this.acc / PHYS_DT;
    const p = this.prev, c = this.cur, m = this.model, v = this.vehicle;
    let dh = c.heading - p.heading;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    const heading = p.heading + dh * a;
    const pitch = p.pitch + (c.pitch - p.pitch) * a;
    const roll = p.roll + (c.roll - p.roll) * a;
    // Root sits on the ground under the CG (model origin is ground level, mid-wheelbase).
    const spec = v.spec;
    const midOffset = spec.dimensions.wheelbase * (0.5 - spec.frontWeight); // CG -> mid-wheelbase along +Z (rear axle is frontWeight*L behind the CG)
    const x = p.x + (c.x - p.x) * a, z = p.z + (c.z - p.z) * a;
    const y = p.y + (c.y - p.y) * a - spec.cgHeight;
    this.e.set(-pitch, heading, roll, 'YXZ');
    this.q.setFromEuler(this.e);
    m.root.quaternion.copy(this.q);
    m.root.position.set(x, y, z);
    m.root.position.add(new THREE.Vector3(0, 0, midOffset).applyQuaternion(this.q));
    v.wheels.forEach((w, i) => {
      this.spins[i] = w.spin;
      m.setWheel(i as 0 | 1 | 2 | 3, w.spin, w.steer, Math.max(-0.06, Math.min(0.06, w.compression)));
    });
    this.flatSpotHeave = v.flatSpots.vibration(this.spins, v.speed) * Math.max(0, Math.min(1, getGraphics().cameraShake)) * heaveScale;
    m.setBodyAttitude(0, 0, this.flatSpotHeave);
    m.setSteeringWheel(v.steerAngle * 9);
    const braking = v.telemetry.brake > 0.05;
    m.setBrakeLights(braking);
    m.setBrakeGlow(brakeGlow(Math.max(...v.brakes.discs.map((disc) => disc.tempC))));
  }

  private applyVisualDamage(imp: ImpactReport): void {
    const sev = impactSeverity(imp.speed);
    if (sev <= 0) return;
    const v = this.vehicle;
    const [lx, lzCg] = impactLocal(v, imp);
    const midOffset = v.spec.dimensions.wheelbase * (0.5 - v.spec.frontWeight);
    const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
    // Wall normal (pointing back to the track) in car-local axes; the hit pushes INTO the body along -normal.
    const nLat = imp.nx * cos - imp.nz * sin, nLong = imp.nx * sin + imp.nz * cos;
    this.model.applyImpact({
      point: new THREE.Vector3(lx, 0.45, lzCg - midOffset),
      direction: new THREE.Vector3(nLat, 0, nLong).normalize(),
      severity: sev,
    });
  }

  repair(): void {
    this.vehicle.repair();
    this.model.resetDamage();
  }
}
