// Diagnostic: where does the Torana touch a wall on an autopilot lap and a colour-following lap?
// npx vitest run --config vitest.debug.config.ts tests/debug/torana-impacts.test.ts --silent=false
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { CAR_SPECS, type CarSpec } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';
import { LINE_PROFILE } from '@/track/speed-profile';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);
const DT = 1 / 360;

function lap(spec: CarSpec, label: string): void {
  const tuned = tunedSpec(spec, DEFAULT_HANDLING);
  const ai = computeSpeedProfile(track, line, tuned, AI_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, ai);
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let lastLog = -10;
  for (let t = 0; t < 170; t += DT) {
    ap.drive(v, inp);
    for (const im of v.step(inp, DT)) {
      if (im.speed > 0.3 && t - lastLog > 0.5) {
        lastLog = t;
        const i = Math.round(v.tp.s / track.spacing) % track.n;
        console.log(`${label} t=${t.toFixed(1)} s=${v.tp.s.toFixed(0)} impact ${im.speed.toFixed(2)} m/s speed ${(v.speed * 3.6).toFixed(0)} km/h (profile ${(ai.speed[i] * 3.6).toFixed(0)}) gear ${v.pt.gear} d=${v.tp.d.toFixed(2)} line=${line.offset[i].toFixed(2)} steer=${inp.steer.toFixed(2)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)}`);
      }
    }
  }
}

function colours(spec: CarSpec, label: string): void {
  const prof = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), LINE_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const steer = new Autopilot(track, line, prof);
  v.reset(100, line.offset[Math.round(100 / track.spacing)]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let lastLog = -10;
  for (let t = 0; t < 200; t += DT) {
    steer.drive(v, inp);
    const s = v.tp.s, sp = Math.max(0, v.speed);
    let r = -Infinity;
    for (let d = 6; d <= 30; d += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], sp, d));
    inp.brake = r > LINE_RED ? 1 : 0;
    inp.throttle = r > LINE_YELLOW ? 0 : 1;
    for (const im of v.step(inp, DT)) {
      if (im.speed > 0.3 && t - lastLog > 0.5) {
        lastLog = t;
        const i = Math.round(v.tp.s / track.spacing) % track.n;
        console.log(`${label} t=${t.toFixed(1)} s=${v.tp.s.toFixed(0)} impact ${im.speed.toFixed(2)} m/s speed ${(v.speed * 3.6).toFixed(0)} km/h (line ${(prof.speed[i] * 3.6).toFixed(0)}) gear ${v.pt.gear} d=${v.tp.d.toFixed(2)} line=${line.offset[i].toFixed(2)}`);
      }
    }
  }
}

/** Per-step trace through s 1700-2100 of an autopilot lap (first pass only), one row per ~12 m. */
function trace(spec: CarSpec, label: string): void {
  const tuned = tunedSpec(spec, DEFAULT_HANDLING);
  const ai = computeSpeedProfile(track, line, tuned, AI_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, ai);
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let lastS = -100, maxImpact = 0;
  for (let t = 0; t < 120; t += DT) {
    ap.drive(v, inp);
    for (const im of v.step(inp, DT)) if (v.tp.s > 1700 && v.tp.s < 2100) maxImpact = Math.max(maxImpact, im.speed);
    const s = v.tp.s;
    if (s > 1700 && s < 2100 && s - lastS >= 12) {
      lastS = s;
      const i = Math.round(s / track.spacing) % track.n;
      const w = v.wheels, tl = v.telemetry;
      const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
      const beta = Math.atan2(v.vx * cos - v.vz * sin, Math.max(1, v.vx * sin + v.vz * cos));
      console.log(`${label} s=${s.toFixed(0)} v=${(v.speed * 3.6).toFixed(0)} prof=${(ai.speed[i] * 3.6).toFixed(0)} err=${(v.tp.d - line.offset[i]).toFixed(2)} gear=${v.pt.gear}${tl.shifted ? '*' : ''} rpm=${tl.rpm.toFixed(0)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} steer=${inp.steer.toFixed(2)} yaw=${v.yawRate.toFixed(2)} beta=${beta.toFixed(3)} load=${w.map((x) => (x.load / 1000).toFixed(1)).join('/')} use=${w.map((x) => x.slip.toFixed(2)).join('/')}`);
    }
    if (s > 2100 && t > 20) break;
  }
  console.log(`${label} max impact in window ${maxImpact.toFixed(2)}`);
}

/** Max wall impact and worst line error through the Cutting for an autopilot lap (SWEEP env: JSON list of spec overrides). */
function window(spec: CarSpec): string {
  const ai = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), AI_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, ai);
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let maxImpact = 0, worst = 0, minLoad = 1e9;
  for (let t = 0; t < 120; t += DT) {
    ap.drive(v, inp);
    for (const im of v.step(inp, DT)) if (v.tp.s > 1700 && v.tp.s < 2100) maxImpact = Math.max(maxImpact, im.speed);
    const s = v.tp.s;
    if (s > 1900 && s < 2100) {
      const i = Math.round(s / track.spacing) % track.n;
      worst = Math.max(worst, Math.abs(v.tp.d - line.offset[i]));
      minLoad = Math.min(minLoad, v.wheels[2].load);
    }
    if (s > 2100 && t > 20) break;
  }
  return `impact ${maxImpact.toFixed(2)} worstErr ${worst.toFixed(2)} minRL ${(minLoad / 1000).toFixed(2)}kN`;
}

/** The colour-following driver (as tests/colour-driver-fixture.ts) from s 100 to the end of the Cutting. */
function coloursWindow(spec: CarSpec): string {
  const prof = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), LINE_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const steer = new Autopilot(track, line, prof);
  v.reset(100, line.offset[Math.round(100 / track.spacing)]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let maxImpact = 0, worst = 0;
  for (let t = 0; t < 200; t += DT) {
    steer.drive(v, inp);
    const s = v.tp.s, sp = Math.max(0, v.speed);
    let r = -Infinity;
    for (let d = 6; d <= 30; d += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], sp, d));
    inp.brake = r > LINE_RED ? 1 : 0;
    inp.throttle = r > LINE_YELLOW ? 0 : 1;
    for (const im of v.step(inp, DT)) if (v.tp.s > 1700 && v.tp.s < 2100) maxImpact = Math.max(maxImpact, im.speed);
    if (s > 1900 && s < 2100) worst = Math.max(worst, Math.abs(v.tp.d - line.offset[Math.round(s / track.spacing) % track.n]));
    if (s > 2100) break;
  }
  return `impact ${maxImpact.toFixed(2)} worstErr ${worst.toFixed(2)}`;
}

/** Colour-driver trace through the Cutting (one row per ~12 m). */
function coloursTrace(spec: CarSpec, label: string): void {
  const prof = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), LINE_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const steer = new Autopilot(track, line, prof);
  v.reset(100, line.offset[Math.round(100 / track.spacing)]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let lastS = -100;
  for (let t = 0; t < 200; t += DT) {
    steer.drive(v, inp);
    const s = v.tp.s, sp = Math.max(0, v.speed);
    let r = -Infinity;
    for (let d = 6; d <= 30; d += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], sp, d));
    inp.brake = r > LINE_RED ? 1 : 0;
    inp.throttle = r > LINE_YELLOW ? 0 : 1;
    v.step(inp, DT);
    if (s > 1850 && s < 2100 && s - lastS >= 10) {
      lastS = s;
      const i = Math.round(s / track.spacing) % track.n, w = v.wheels;
      console.log(`${label} s=${s.toFixed(0)} v=${(v.speed * 3.6).toFixed(0)} line=${(prof.speed[i] * 3.6).toFixed(0)} err=${(v.tp.d - line.offset[i]).toFixed(2)} gear=${v.pt.gear} thr=${inp.throttle} brk=${inp.brake} steer=${inp.steer.toFixed(2)} yaw=${v.yawRate.toFixed(2)} load=${w.map((x) => (x.load / 1000).toFixed(1)).join('/')} use=${w.map((x) => x.slip.toFixed(2)).join('/')}`);
    }
    if (s > 2100) break;
  }
}

it('traces the colour driver at the Cutting', () => {
  coloursTrace(CAR_SPECS.torana, 'CTORANA');
  coloursTrace(CAR_SPECS.camaro, 'CCAMARO');
}, 600000);

it('sweeps spec variants through the Cutting', () => {
  const sweep = process.env.SWEEP;
  if (!sweep) return;
  console.log(`SWEEP camaro ${window(CAR_SPECS.camaro)} | colours ${coloursWindow(CAR_SPECS.camaro)}`);
  const text = sweep.startsWith('/') ? readFileSync(sweep, 'utf8') : sweep;
  for (const o of JSON.parse(text) as Array<Partial<CarSpec>>) {
    const spec = { ...CAR_SPECS.torana, ...o };
    console.log(`SWEEP ${JSON.stringify(o)} ${window(spec)} | colours ${coloursWindow(spec)}`);
  }
}, 900000);

it('traces the Cutting for the torana and the camaro', () => {
  trace(CAR_SPECS.torana, 'TORANA');
  trace(CAR_SPECS.camaro, 'CAMARO');
}, 600000);

it('logs the Torana wall impacts for two drag values', () => {
  for (const cdA of [1.08, 1.05]) lap({ ...CAR_SPECS.torana, cdA }, `AI cdA ${cdA}`);
  for (const cdA of [1.08, 1.05]) colours({ ...CAR_SPECS.torana, cdA }, `COLOURS cdA ${cdA}`);
}, 600000);
