import type { CarSpec } from '@/car/car-specs';

/** Full-throttle engine torque (Nm) at rpm, linear interpolation of the spec curve. */
export function engineTorque(spec: CarSpec, rpm: number): number {
  const c = spec.engine.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const [r0, t0] = c[i - 1], [r1, t1] = c[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return c[c.length - 1][1];
}

export interface PowertrainState {
  gear: number; // -1, 0, 1..6
  rpm: number;
  shiftTimer: number;
  onLimiter: boolean;
  shifted: boolean;
  /** Seconds the car has been held still on the brake (for auto reverse). */
  stillTimer: number;
  /** True once the brake was released while stopped: the next long press selects reverse. */
  reverseArmed: boolean;
}

export function createPowertrain(spec: CarSpec): PowertrainState {
  return { gear: 1, rpm: spec.engine.idleRpm, shiftTimer: 0, onLimiter: false, shifted: false, stillTimer: 0, reverseArmed: false };
}

export function gearRatio(spec: CarSpec, gear: number): number {
  if (gear === 0) return 0;
  if (gear < 0) return -spec.reverseRatio;
  return spec.gearRatios[gear - 1];
}

/** Wheel speed (m/s) to engine rpm in a gear. */
export function wheelToRpm(spec: CarSpec, gear: number, wheelSpeed: number): number {
  return (Math.abs(wheelSpeed) / spec.dimensions.wheelRadius) * Math.abs(gearRatio(spec, gear)) * spec.finalDrive * (60 / (2 * Math.PI));
}

/** Top speed in automatic reverse (m/s). */
export const REVERSE_MAX_MS = 5.5;

export interface PowertrainInput {
  throttle: number;
  brake: number;
  shiftUp: boolean;
  shiftDown: boolean;
  autoGears: boolean;
  /** Longitudinal speed of the driven (rear) wheels, m/s. */
  wheelSpeed: number;
  /** Extra rpm from wheelspin (0 when gripping). */
  spinRpm: number;
  /** 0..1 engine damage (power loss). */
  engineDamage: number;
  /** Disables the automatic shift into reverse (car held on the grid). */
  noAutoReverse?: boolean;
}

/**
 * Advances gearbox and engine one step. Returns the drive force at the rear
 * contact patches (N, + = forward along the car).
 */
export function stepPowertrain(spec: CarSpec, st: PowertrainState, inp: PowertrainInput, dt: number): number {
  st.shifted = false;
  const e = spec.engine;
  const shift = (to: number) => {
    if (to === st.gear || to > spec.gearRatios.length || to < -1) return;
    st.gear = to;
    st.shiftTimer = spec.shiftTimeS;
    st.shifted = true;
  };
  if (st.shiftTimer > 0) st.shiftTimer -= dt;
  else if (inp.shiftUp) shift(st.gear === -1 ? 1 : st.gear + 1);
  else if (inp.shiftDown && st.gear > 1) {
    // Refuse a downshift that would over-rev.
    if (wheelToRpm(spec, st.gear - 1, inp.wheelSpeed) < e.limiterRpm - 150) shift(st.gear - 1);
  } else if (inp.shiftDown && st.gear === 1 && Math.abs(inp.wheelSpeed) < 1) shift(-1);

  if (inp.autoGears && st.shiftTimer <= 0) {
    const v = inp.wheelSpeed;
    if (st.gear >= 1) {
      const rpmNow = wheelToRpm(spec, st.gear, v);
      if (rpmNow > e.redlineRpm - 80 && st.gear < spec.gearRatios.length && inp.throttle > 0.1) shift(st.gear + 1);
      else if (st.gear > 1) {
        const lower = wheelToRpm(spec, st.gear - 1, v);
        // Under braking keep the engine in its power band; never drop into an over-revving gear.
        const braking = inp.brake > 0.2;
        const downAt = braking ? 5000 : 4300;
        const maxLower = braking ? e.redlineRpm - 1200 : e.redlineRpm - 500;
        // Supercars take the slow corners (Cutting, Dipper, Elbow, Murray's) in 2nd: never auto-select 1st above ~40 km/h.
        const intoFirst = st.gear - 1 === 1 && Math.abs(v) > 11;
        if (rpmNow < downAt && lower < maxLower && !intoFirst) shift(st.gear - 1);
      }
    }
    // Auto reverse: hold the brake at a standstill, throttle selects first again.
    // Auto reverse needs a fresh press: stop, release the brake, then press and hold it.
    // (A driver who keeps the brake on after a spin must not roll backwards.)
    const stopped = Math.abs(v) < 0.4;
    if (!stopped) st.reverseArmed = false;
    else if (inp.brake < 0.1) st.reverseArmed = true;
    if (stopped && st.reverseArmed && inp.brake > 0.5 && inp.throttle < 0.05) st.stillTimer += dt;
    else st.stillTimer = 0;
    if (st.gear >= 1 && st.stillTimer > 0.6 && !inp.noAutoReverse) shift(-1);
    if (st.gear === -1 && inp.throttle > 0.1 && Math.abs(v) < 1) shift(1);
  }

  // Automatic reverse: the brake pedal drives the car backwards (to about 20 km/h);
  // the vehicle turns the throttle pedal into the brake meanwhile.
  const autoRev = inp.autoGears && st.gear === -1;
  const pedal = autoRev ? (inp.wheelSpeed < -REVERSE_MAX_MS ? 0 : inp.brake) : inp.throttle;
  const ratio = gearRatio(spec, st.gear);
  const wheelRpm = wheelToRpm(spec, st.gear, inp.wheelSpeed);
  // Launch: the clutch slips until the wheels catch up with the engine.
  const launchRpm = e.idleRpm + pedal * (4200 - e.idleRpm);
  const target = st.gear === 0 ? e.idleRpm + pedal * (e.limiterRpm - e.idleRpm) : Math.max(wheelRpm + inp.spinRpm, Math.abs(st.gear) === 1 ? launchRpm : e.idleRpm);
  st.rpm += (target - st.rpm) * Math.min(1, dt * 30);
  st.onLimiter = st.rpm >= e.limiterRpm - 20;
  if (st.rpm > e.limiterRpm) st.rpm = e.limiterRpm;
  if (ratio === 0 || st.shiftTimer > 0) return 0;

  let torque = engineTorque(spec, st.rpm) * pedal * (1 - 0.6 * inp.engineDamage);
  if (st.onLimiter && pedal > 0) torque = 0;
  if (pedal < 0.05) {
    // Engine braking only while rolling forward in a forward gear.
    if (st.gear < 0) return 0;
    torque = -e.engineBrakeNm * Math.min(1, st.rpm / e.limiterRpm) * Math.min(1, Math.max(0, inp.wheelSpeed / 3));
  }
  return (torque * ratio * spec.finalDrive * spec.drivetrainEfficiency) / spec.dimensions.wheelRadius;
}
