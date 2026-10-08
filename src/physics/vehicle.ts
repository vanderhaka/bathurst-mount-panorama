import type { CarSpec } from '@/car/car-specs';
import { DEFAULT_HANDLING, type HandlingConfig } from '@/config/handling';
import { defaultSetup, type CarSetup } from '@/config/setup';
import type { KerbLayout } from '@/track/kerbs';
import { kerbCrossfallAt } from '@/track/kerb-profile';
import type { Track } from '@/track/track-model';
import { createTrackPoint, projectToTrack, sampleArray, type SurfaceKind, type TrackPoint } from '@/track/track-query';
import { resolveWalls } from '@/physics/collision';
import { contactPass, settleOnGround } from '@/physics/vehicle-contact';
import { TrackGrip } from '@/track/rubber-line';
import { applyImpactDamage, createDamage } from '@/physics/damage';
import { createPowertrain, stepPowertrain, type PowertrainState } from '@/physics/powertrain';
import { VehicleStint } from '@/physics/vehicle-stint';
import { pressureGrip, suspensionCorners, suspensionForce, type SuspensionCorner } from '@/physics/setup-forces';
import { SURFACE, tyreCurve, tyreForces, type TyreResult } from '@/physics/tyre';
import type { DamageState, ImpactReport, VehicleInput, VehicleTelemetry, WheelTelemetry } from '@/physics/types';

const G = 9.81;
const RHO = 1.2;

export interface VehicleAssists {
  abs: boolean;
  tc: boolean;
  autoGears: boolean;
  mechanicalDamage: boolean; // false = impacts leave the mechanics as new (damage setting "Visual only" or "Off")
}

/**
 * Gen3 Supercar dynamics: planar 4-wheel tyre model on the real track surface
 * with a heave/pitch/roll suspension that produces the tyre loads.
 */
export class Vehicle {
  // Planar state (world): position of the CG, velocity, heading (0 = +Z, + = left), yaw rate.
  x = 0; z = 0; vx = 0; vz = 0; heading = 0; yawRate = 0;
  // Vertical state: CG height, pitch (+ nose up), roll (+ left side up).
  y = 0; vy = 0; pitch = 0; pitchRate = 0; roll = 0; rollRate = 0;
  readonly pt: PowertrainState;
  readonly damage: DamageState = createDamage();
  readonly tp: TrackPoint = createTrackPoint();
  readonly wheels: WheelTelemetry[];
  readonly telemetry: VehicleTelemetry;
  readonly stint = new VehicleStint();
  readonly trackGrip: TrackGrip;
  readonly brakes = this.stint.brakes;
  readonly flatSpots = this.stint.flatSpots;
  /** Monotonic game seconds, advanced only by fixed physics steps. */
  simulationS = 0;
  assists: VehicleAssists = { abs: true, tc: true, autoGears: true, mechanicalDamage: true };
  handling: Readonly<HandlingConfig> = DEFAULT_HANDLING; // multipliers from Settings > Handling
  setup: Readonly<CarSetup>;
  steerAngle = 0;
  private readonly corners: SuspensionCorner[];
  private readonly wtp: TrackPoint[] = [0, 1, 2, 3].map(() => createTrackPoint());
  private readonly tyre: TyreResult = { fx: 0, fy: 0, use: 0, absActive: false, tcActive: false };
  private prevComp = [0, 0, 0, 0];
  /** Lateral force of the front and rear axle from the last step (body axes, + = left). */
  private readonly axleFy = [0, 0];
  private readonly comps = [0, 0, 0, 0];
  private readonly surfs: SurfaceKind[] = ['road', 'road', 'road', 'road'];
  private readonly a: number;
  private readonly b: number;

  constructor(readonly spec: CarSpec, readonly track: Track, readonly kerbs: KerbLayout) {
    const d = spec.dimensions;
    this.b = d.wheelbase * spec.frontWeight; // CG to rear axle
    this.a = d.wheelbase - this.b; // CG to front axle
    this.corners = suspensionCorners(spec, this.a, this.b);
    this.setup = defaultSetup(spec.kind);
    this.trackGrip = new TrackGrip(track, kerbs.line);
    this.pt = createPowertrain(spec);
    this.wheels = this.corners.map(() => ({ load: 0, slip: 0, surface: 'road' as const, spin: 0, compression: 0, steer: 0 }));
    this.telemetry = {
      speed: 0, rpm: spec.engine.idleRpm, gear: 1, throttle: 0, brake: 0, steer: 0, onLimiter: false,
      fuel: this.stint.fuel, tyres: this.stint.tyres, brakes: this.brakes.discs, flatSpots: this.flatSpots.tyres,
      tcActive: false, absActive: false, shifted: false, gLong: 0, gLat: 0, wheels: this.wheels, airborne: false, load: 0,
    };
  }

  /** Places the car at rest at distance s and lateral offset d, facing the race direction. */
  reset(s: number, d: number): void {
    const t = this.track;
    const i = Math.floor(t.wrapS(s) / t.spacing);
    this.x = t.px[i] + t.lx[i] * d;
    this.z = t.pz[i] + t.lz[i] * d;
    this.heading = Math.atan2(t.tx[i], t.tz[i]);
    this.vx = this.vz = this.yawRate = 0;
    this.vy = this.pitchRate = this.rollRate = 0;
    this.axleFy[0] = this.axleFy[1] = 0;
    this.pitch = this.roll = 0;
    projectToTrack(t, this.x, this.z, -1, this.tp);
    this.stint.placeOnTrack(this.tp.s);
    settleOnGround(this, this.corners, this.wtp, this.a, this.b);
    this.pt.gear = 1;
    this.pt.rpm = this.spec.engine.idleRpm;
    this.steerAngle = 0;
    // Start the dampers from the real compression (a twisted or steep road is not
    // exactly the settle plane); otherwise the first step sees a huge damper speed.
    contactPass(this, this.corners, this.wtp, this.comps, this.surfs);
    for (let w = 0; w < 4; w++) this.prevComp[w] = this.comps[w];
  }

  /** World x/z of a wheel's contact patch. */
  wheelWorld(i: number, out: [number, number]): [number, number] {
    const c = this.corners[i];
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    out[0] = this.x + c.x * cos + c.z * sin;
    out[1] = this.z - c.x * sin + c.z * cos;
    return out;
  }

  repair(): void {
    Object.assign(this.damage, createDamage());
  }

  get speed(): number {
    return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
  }
  get massKg(): number { return this.stint.fuel.massKg(this.spec.massKg); }
  /** Advances the simulation by dt seconds (use about 1/360 s). Returns wall impacts. */
  step(input: VehicleInput, dt: number): ImpactReport[] {
    const { spec, track } = this;
    const hc = this.handling, curve = tyreCurve((hc.peakSlipDeg * Math.PI) / 180, hc.slideGrip);
    const m = this.massKg;
    const sin = Math.sin(this.heading), cos = Math.cos(this.heading);
    // Body axes: forward f = (sin, cos), left l = (cos, -sin).
    const vLong = this.vx * sin + this.vz * cos;
    const vLat = this.vx * cos - this.vz * sin;
    projectToTrack(track, this.x, this.z, this.tp.index, this.tp);
    // Steering: rate-limited road-wheel angle, plus a pull from suspension damage.
    const targetSteer = input.steer * spec.maxSteerRad;
    const rate = ((hc.steerSpeedDeg * Math.PI) / 180) * dt;
    this.steerAngle += Math.max(-rate, Math.min(rate, targetSteer - this.steerAngle));
    const pull = (this.damage.left - this.damage.right) * this.damage.suspension * 0.03;
    // Aero.
    const v2 = vLong * vLong + vLat * vLat;
    const downforce = 0.5 * RHO * spec.clA * hc.downforce * (1 - 0.35 * this.damage.aero) * v2;
    const drag = 0.5 * RHO * spec.cdA * (1 + 0.25 * this.damage.aero) * Math.sqrt(v2);
    // Powertrain (rear-wheel drive, locked-ish differential: equal split).
    let rearSlip = Math.max(this.wheels[2].slip, this.wheels[3].slip);
    // Automatic reverse: the brake pedal drives backwards (powertrain), the throttle pedal brakes.
    const autoRev = this.assists.autoGears && this.pt.gear === -1;
    const drivePedal = autoRev ? input.brake : input.throttle;
    const brakePedal = autoRev ? input.throttle : input.brake;
    const spinRpm = rearSlip > 1 && drivePedal > 0.3 ? Math.min(2500, (rearSlip - 1) * 6000) : 0;
    const drive = stepPowertrain(spec, this.pt, {
      throttle: input.throttle, brake: input.brake, shiftUp: input.shiftUp, shiftDown: input.shiftDown,
      autoGears: this.assists.autoGears, wheelSpeed: vLong, spinRpm, engineDamage: this.damage.engine, noAutoReverse: input.hold,
    }, dt) * (this.stint.fuel.litres > 0 ? 1 : 0);
    let fLong = 0, fLat = 0, yawM = 0, heave = 0, pitchM = 0, rollM = 0, gx = 0, gz = 0;
    let anyGround = false, absActive = false, tcActive = false;
    const R = spec.dimensions.wheelRadius;
    rearSlip = 0;
    let fyFront = 0, fyRear = 0;
    // Pass 1: contact points, ground and suspension compression of all four corners.
    contactPass(this, this.corners, this.wtp, this.comps, this.surfs);
    const comps = this.comps, surfs = this.surfs;
    // Pass 2: tyre loads and forces.
    for (let w = 0; w < 4; w++) {
      const c = this.corners[w];
      const front = w < 2;
      const tp = this.wtp[w];
      const surf = surfs[w];
      const S = SURFACE[surf];
      const comp = comps[w];
      const arb = front ? this.setup.frontArbNpm : this.setup.rearArbNpm;
      const fs = suspensionForce(c, comp, this.prevComp[w], comps[w ^ 1], spec.cgHeight, arb, dt);
      // Geometric load transfer through the links (roll centre): moves load to the outside
      // wheel at once, without body roll. An unloaded spring means the wheel is off the ground.
      const geometric = -Math.sign(c.x) * this.axleFy[front ? 0 : 1] * c.rc / (2 * Math.abs(c.x));
      const fz = fs > 0 ? Math.max(0, fs + geometric) : 0;
      if (fz > 0) anyGround = true;
      // Velocity of the contact patch in body axes, then in wheel axes.
      const uB = vLong - this.yawRate * c.x;
      const wB = vLat + this.yawRate * c.z;
      const steer = front ? this.steerAngle + pull : 0;
      const cs = Math.cos(steer), sn = Math.sin(steer);
      const u = uB * cs + wB * sn;
      const wl = -uB * sn + wB * cs;
      const sideDamage = c.x > 0 ? this.damage.left : this.damage.right;
      const pressure = pressureGrip(front ? this.setup.frontPressureKpa : this.setup.rearPressureKpa);
      const mu = spec.tyreMu * hc.grip * (front ? 1 : hc.rearGrip) * S.grip * pressure * this.stint.tyres[w].grip * this.flatSpots.tyres[w].gripMultiplier * this.trackGrip.at(tp.index, tp.t, tp.d, surf) * (1 - 0.18 * sideDamage * this.damage.suspension);
      const bias = front ? this.setup.brakeBiasFront : 1 - this.setup.brakeBiasFront;
      const brakeF = (brakePedal * spec.maxBrakeTorqueNm * (bias / spec.brakeBiasFront)) / R * this.brakes.discs[w].forceMultiplier;
      const driveF = front ? 0 : drive / 2;
      const r = tyreForces(fz, mu, u, wl, driveF, brakeF, this.assists.abs, this.assists.tc, fz / G, dt, this.tyre, curve);
      const locked = this.stint.advanceContact(w, fz, mu, u, driveF, brakeF, r, surf, dt);
      absActive ||= r.absActive;
      tcActive ||= r.tcActive;
      // Surface drag (grass, gravel) and rolling resistance oppose wheel travel.
      const roll = fz * S.drag * Math.tanh(u * 2);
      const fxw = r.fx - roll;
      const fbL = fxw * cs - r.fy * sn;
      const fbT = fxw * sn + r.fy * cs;
      fLong += fbL;
      fLat += fbT;
      yawM += c.z * fbT - c.x * fbL;
      heave += fz;
      pitchM += fz * c.z;
      rollM += fz * c.x;
      if (front) fyFront += fbT; else fyRear += fbT;
      // Slope: the ground reaction leans with the surface (horizontal push downhill).
      const grade = sampleArray(track, track.grade, tp.index, tp.t);
      const cross = kerbCrossfallAt(track, this.kerbs, tp.index, tp.t, tp.d);
      const ti = tp.index;
      gx -= fz * (grade * track.tx[ti] / Math.max(0.2, Math.hypot(track.tx[ti], track.tz[ti])) + cross * track.lx[ti]);
      gz -= fz * (grade * track.tz[ti] / Math.max(0.2, Math.hypot(track.tx[ti], track.tz[ti])) + cross * track.lz[ti]);
      const wt = this.wheels[w];
      wt.load = fz;
      wt.slip = r.use;
      wt.surface = surf;
      wt.spin += locked ? 0 : (u / R) * dt * (r.use > 1 && !front && input.throttle > 0.3 ? 1.6 : 1);
      wt.compression = comp - (c.h0 - spec.cgHeight);
      wt.steer = steer;
      if (!front) rearSlip = Math.max(rearSlip, r.use);
    }
    for (let w = 0; w < 4; w++) this.prevComp[w] = comps[w];
    this.axleFy[0] = fyFront;
    this.axleFy[1] = fyRear;
    // Planar integration (body forces to world).
    fLong -= drag * vLong;
    fLat -= drag * vLat;
    const fx = fLong * sin + fLat * cos + gx;
    const fz2 = fLong * cos - fLat * sin + gz;
    const ax = fx / m, az = fz2 / m;
    this.vx += ax * dt;
    this.vz += az * dt;
    this.yawRate += (yawM / (spec.yawInertia * m / spec.massKg)) * dt;
    if (!anyGround) this.yawRate *= 1 - 0.5 * dt;
    this.heading += this.yawRate * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    // Hold the car still at very low speed with no throttle (static friction).
    if (drivePedal < 0.02 && Math.hypot(this.vx, this.vz) < 0.25 && anyGround) {
      this.vx = this.vz = 0;
      this.yawRate *= 0.5;
    }
    // Vertical, pitch and roll.
    const h = spec.cgHeight;
    this.vy += ((heave - m * G - downforce) / m) * dt;
    this.y += this.vy * dt;
    const dF = downforce * spec.aeroBalanceFront, dR = downforce - dF;
    this.pitchRate += ((pitchM - dF * this.a + dR * this.b + fLong * h) / 1900) * dt;
    this.pitchRate *= 1 - 2 * dt;
    this.pitch += this.pitchRate * dt;
    this.rollRate += ((rollM + fLat * h) / 560) * dt;
    this.rollRate *= 1 - 2 * dt;
    this.roll += this.rollRate * dt;
    this.pitch = Math.max(-0.4, Math.min(0.4, this.pitch));
    this.roll = Math.max(-0.3, Math.min(0.3, this.roll));
    const impacts = resolveWalls(this, track);
    if (this.assists.mechanicalDamage) for (const imp of impacts) applyImpactDamage(this, imp);
    const t = this.telemetry;
    t.speed = this.speed;
    t.rpm = this.pt.rpm;
    t.gear = this.pt.gear;
    t.throttle = input.throttle;
    t.brake = input.brake;
    t.steer = input.steer;
    t.onLimiter = this.pt.onLimiter;
    t.tcActive = tcActive;
    t.absActive = absActive;
    t.shifted = t.shifted || this.pt.shifted;
    t.gLong = (ax * sin + az * cos) / G;
    t.gLat = (ax * cos - az * sin) / G;
    t.airborne = !anyGround;
    t.load = input.throttle > 0.05 && this.stint.fuel.litres > 0 ? input.throttle : 0;
    this.stint.advance(t, dt, this.tp.s, track.startLineS, this.assists.autoGears && t.gear === -1 ? t.brake : t.throttle);
    this.trackGrip.advance(dt, t.speed);
    this.simulationS += dt;
    return impacts;
  }
}
