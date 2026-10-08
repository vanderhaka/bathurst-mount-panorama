// Wheel-lift diagnostics (no assertions): per-wheel load in steady circles, step steers,
// slaloms and autopilot laps. Run: npx vitest run --config vitest.debug.config.ts tests/debug/wheel-lift-probe.test.ts --silent=false
// PROBE_CG=<m> overrides the CG height of all cars (what-if runs without editing the specs).
import { it } from 'vitest';
import { CAR_SPECS, type CarKind, type CarSpec } from '@/car/car-specs';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs, type KerbLayout } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const DT = 1 / 360;
const CARS = (process.env.PROBE_CARS ?? 'camaro,mustang,supra').split(',') as CarKind[];
const spec = (kind: CarKind): CarSpec => process.env.PROBE_CG ? { ...CAR_SPECS[kind], cgHeight: Number(process.env.PROBE_CG) } : CAR_SPECS[kind];
const idle = (): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false });

function flatWorld(): { track: Track; kerbs: KerbLayout } {
  const track = new Track();
  const line = computeRacingLine(track);
  track.py.fill(0); track.grade.fill(0); track.bank.fill(0);
  for (const side of [track.left, track.right]) { side.edge.fill(5000); side.wall.fill(9000); }
  const n = track.n;
  return { track, kerbs: { line, left: new Float32Array(n), right: new Float32Array(n), leftType: new Uint8Array(n), rightType: new Uint8Array(n) } };
}

interface Stats { minLoad: number[]; zeroS: number; events: number; maxRollDeg: number; maxG: number; gAtLift: number; was: boolean }
const stats = (): Stats => ({ minLoad: [Infinity, Infinity, Infinity, Infinity], zeroS: 0, events: 0, maxRollDeg: 0, maxG: 0, gAtLift: 0, was: false });
function record(st: Stats, v: Vehicle): void {
  let zero = false;
  v.wheels.forEach((w, i) => { st.minLoad[i] = Math.min(st.minLoad[i], w.load); if (w.load <= 0) zero = true; });
  if (zero) { st.zeroS += DT; if (!st.was) { st.events++; if (!st.gAtLift) st.gAtLift = Math.abs(v.telemetry.gLat); } }
  st.was = zero;
  st.maxRollDeg = Math.max(st.maxRollDeg, Math.abs(v.roll) * 180 / Math.PI);
  st.maxG = Math.max(st.maxG, Math.abs(v.telemetry.gLat));
}
const fmt = (st: Stats) => `minLoad=[${st.minLoad.map((l) => l.toFixed(0)).join(',')}] zero=${st.zeroS.toFixed(2)}s events=${st.events} roll=${st.maxRollDeg.toFixed(2)}deg maxG=${st.maxG.toFixed(2)} firstLiftG=${st.gAtLift.toFixed(2)}`;

function launch(v: Vehicle, speed: number): void {
  v.reset(1000, 0);
  for (let k = 0; k < 360; k++) v.step(idle(), DT);
  v.vx = Math.sin(v.heading) * speed; v.vz = Math.cos(v.heading) * speed;
  v.pt.gear = speed > 60 ? 6 : speed > 45 ? 5 : speed > 35 ? 4 : 3;
  for (let k = 0; k < 360; k++) v.step({ ...idle(), throttle: 0.3 }, DT);
}

/** Holds a left-hand circle of radius R while the lateral target ramps 0.05 g/s; stops when the radius is lost. */
function circle(kind: CarKind, R: number, trace = false): Stats {
  const { track, kerbs } = flatWorld();
  const v = new Vehicle(spec(kind), track, kerbs);
  let ay = 0.8 * 9.81, target = Math.sqrt(ay * R);
  launch(v, target);
  const cx = v.x + Math.cos(v.heading) * R, cz = v.z - Math.sin(v.heading) * R;
  const st = stats(), inp = idle();
  let integ = 0, iSpeed = 0, lost = 0;
  for (let t = 0; t < 60; t += DT) {
    const dx = cx - v.x, dz = cz - v.z, r = Math.hypot(dx, dz);
    let eh = Math.atan2(-dz / r, dx / r) - v.heading;
    while (eh > Math.PI) eh -= 2 * Math.PI;
    while (eh < -Math.PI) eh += 2 * Math.PI;
    const e = r - R; // + = outside the circle
    integ = Math.max(-0.2, Math.min(0.2, integ + e * 0.02 * DT));
    const delta = v.spec.dimensions.wheelbase / R * 1.3 + eh + Math.atan(0.6 * e / Math.max(5, v.speed)) + integ - 0.02 * (v.yawRate - v.speed / R);
    inp.steer = Math.max(-1, Math.min(1, delta / v.spec.maxSteerRad));
    ay += 0.05 * 9.81 * DT; target = Math.sqrt(ay * R);
    const err = target - v.speed;
    iSpeed = Math.max(-0.3, Math.min(0.5, iSpeed + err * 0.05 * DT));
    inp.throttle = Math.max(0, Math.min(1, err * 0.5 + iSpeed + 0.3));
    inp.shiftUp = v.pt.gear < 6 && v.pt.rpm > 7000;
    v.step(inp, DT);
    if (t > 1) record(st, v);
    if (trace && Math.round(t / DT) % 90 === 0) console.log(`t=${t.toFixed(2)} v=${(v.speed * 3.6).toFixed(0)} g=${v.telemetry.gLat.toFixed(2)} e=${e.toFixed(2)} roll=${(v.roll * 57.3).toFixed(2)} loads=${v.wheels.map((w) => w.load.toFixed(0)).join(',')} slip=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')}`);
    lost = Math.abs(e) > 3 ? lost + DT : 0;
    if (lost > 0.5) break;
  }
  return st;
}

function stepSteer(kind: CarKind, kmh: number, steer: number, assist = false, trace = false): Stats {
  const { track, kerbs } = flatWorld();
  const v = new Vehicle(spec(kind), track, kerbs);
  launch(v, kmh / 3.6);
  const st = stats(), inp = idle();
  for (let t = 0; t < 2.5; t += DT) {
    inp.steer = assist ? steer / (1 + (v.speed / 40) ** 2) : steer;
    inp.throttle = Math.max(0, Math.min(1, (kmh / 3.6 - v.speed) * 0.5 + 0.4));
    v.step(inp, DT);
    record(st, v);
    if (trace && Math.round(t / DT) % 9 === 0 && t < 1.2) console.log(`t=${t.toFixed(3)} g=${v.telemetry.gLat.toFixed(2)} roll=${(v.roll * 57.3).toFixed(2)} rr=${(v.rollRate * 57.3).toFixed(1)} loads=${v.wheels.map((w) => w.load.toFixed(0)).join(',')} comp=${v.wheels.map((w) => (w.compression * 1000).toFixed(1)).join(',')} slip=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')} yaw=${v.yawRate.toFixed(2)}`);
  }
  return st;
}

function slalom(kind: CarKind, kmh: number, amp: number, hz: number): Stats {
  const { track, kerbs } = flatWorld();
  const v = new Vehicle(spec(kind), track, kerbs);
  launch(v, kmh / 3.6);
  const st = stats(), inp = idle();
  for (let t = 0; t < 4; t += DT) {
    inp.steer = amp * Math.sign(Math.sin(2 * Math.PI * hz * t));
    inp.throttle = Math.max(0, Math.min(1, (kmh / 3.6 - v.speed) * 0.5 + 0.4));
    v.step(inp, DT);
    record(st, v);
  }
  return st;
}

interface Episode { s: number; place: string; zeroS: number; maxWheels: number; mask: number; roll: number; g: number; minTotal: number; kerb: boolean; gapMm: number }

function laps(kind: CarKind, track: Track, verbose: boolean): string {
  const line = computeRacingLine(track), kerbs = placeKerbs(track, line);
  const v = new Vehicle(spec(kind), track, kerbs);
  const profiles = new SessionProfiles(v, line);
  const ap = new Autopilot(track, line, profiles.ai);
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const inp = idle(), mg = v.spec.massKg * 9.81;
  let driven = 0, prev = v.tp.s, elapsed = 0, last = 0, maxImpact = 0, lastZero = -1, minLoad = Infinity, zeroS = 0;
  const lapTimes: number[] = [], eps: Episode[] = [];
  let ep: Episode | null = null;
  for (let k = 0; k < 360 * 420 && lapTimes.length < 3; k++) {
    ap.drive(v, inp);
    const imps = v.step(inp, DT);
    for (const im of imps) maxImpact = Math.max(maxImpact, im.speed);
    profiles.update();
    let d = v.tp.s - prev;
    if (d < -track.length / 2) d += track.length;
    if (d > track.length / 2) d -= track.length;
    driven += d; elapsed += DT; prev = v.tp.s;
    if (driven >= (lapTimes.length + 1) * track.length) { lapTimes.push(elapsed - last); last = elapsed; }
    if (lapTimes.length < 1) continue; // laps 2 and 3 only
    minLoad = Math.min(minLoad, ...v.wheels.map((w) => w.load));
    const zeros = v.wheels.reduce((m, w, i) => m | (w.load <= 0 ? 1 << i : 0), 0);
    if (!zeros) continue;
    zeroS += DT;
    if (!ep || elapsed - lastZero > 0.25) { ep = { s: v.tp.s, place: track.placeAt(v.tp.s), zeroS: 0, maxWheels: 0, mask: 0, roll: 0, g: 0, minTotal: Infinity, kerb: false, gapMm: 0 }; eps.push(ep); }
    lastZero = elapsed;
    ep.zeroS += DT;
    ep.mask |= zeros;
    ep.maxWheels = Math.max(ep.maxWheels, v.wheels.filter((w) => w.load <= 0).length);
    ep.roll = Math.max(ep.roll, Math.abs(v.roll) * 180 / Math.PI);
    // Rendered wheel: offset = clamp(compression, +-0.06), so a visible gap opens below -0.06 m.
    ep.gapMm = Math.max(ep.gapMm, ...v.wheels.map((w) => Math.max(0, -0.06 - w.compression) * 1000));
    ep.g = Math.max(ep.g, Math.abs(v.telemetry.gLat));
    ep.minTotal = Math.min(ep.minTotal, v.wheels.reduce((a, w) => a + w.load, 0) / mg);
    ep.kerb ||= v.wheels.some((w) => w.surface !== 'road') || imps.length > 0;
  }
  const road = eps.filter((e) => !e.kerb);
  const head = `${kind} ${track.id}: laps=${lapTimes.map((l) => l.toFixed(2)).join('/')} impact=${maxImpact.toFixed(2)} minLoad=${minLoad.toFixed(0)} | laps 2-3: episodes=${eps.length} (road ${road.length}, kerb/off ${eps.length - road.length}) twoWheel=${eps.filter((e) => e.maxWheels >= 2).length} visible(gap>5mm)=${eps.filter((e) => e.gapMm > 5).length} maxGap=${Math.max(0, ...eps.map((e) => e.gapMm)).toFixed(0)}mm zero=${zeroS.toFixed(2)}s maxRoll=${Math.max(0, ...eps.map((e) => e.roll)).toFixed(2)}deg`;
  if (!verbose) return head;
  return `${head}\n    ${eps.map((e) => `s=${e.s.toFixed(0)} ${e.place} ${e.zeroS.toFixed(3)}s wheels=${e.mask.toString(2).padStart(4, '0')} max=${e.maxWheels} roll=${e.roll.toFixed(2)} g=${e.g.toFixed(2)} minTotal=${e.minTotal.toFixed(2)}mg gap=${e.gapMm.toFixed(0)}mm ${e.kerb ? 'KERB/OFF' : 'road'}`).join('\n    ')}`;
}

it('circle trace', () => { circle('camaro', 40, true); }, 600000);
it('step trace', () => { stepSteer('camaro', Number(process.env.PROBE_KMH ?? 250), Number(process.env.PROBE_STEER ?? 0.15), false, true); }, 600000);

it('steady circles', () => {
  for (const kind of CARS) for (const R of [13, 40, 100, 250]) console.log(`circle ${kind} R=${R}: ${fmt(circle(kind, R))}`);
}, 600000);

it('step steer', () => {
  for (const kind of CARS) for (const kmh of [150, 200, 250]) for (const s of [0.15, 0.3, 0.6, 1]) console.log(`step ${kind} ${kmh} km/h steer=${s}: ${fmt(stepSteer(kind, kmh, s))}`);
  for (const kind of CARS) for (const kmh of [150, 200, 250]) console.log(`step(kb assist) ${kind} ${kmh}: ${fmt(stepSteer(kind, kmh, 1, true))}`);
}, 600000);

it('slalom', () => {
  for (const kind of CARS) for (const kmh of [120, 180]) for (const amp of [0.3, 0.6]) for (const hz of [0.5, 1]) console.log(`slalom ${kind} ${kmh} amp=${amp} ${hz}Hz: ${fmt(slalom(kind, kmh, amp, hz))}`);
}, 600000);

it('autopilot laps', () => {
  const verbose = process.env.PROBE_VERBOSE === '1';
  const bathurst = new Track(), adelaide = createAdelaideTrack();
  for (const kind of CARS) console.log(laps(kind, bathurst, verbose));
  for (const kind of CARS) console.log(laps(kind, adelaide, verbose));
}, 900000);
