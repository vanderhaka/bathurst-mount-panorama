// Diagnostic: the live per-tyre grip factors (temperature, pressure, track rubber) of the Torana and
// the Camaro as they reach The Cutting on an autopilot lap.
// npx vitest run --config vitest.debug.config.ts tests/debug/torana-grip-probe.test.ts --silent=false
import { it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);
const DT = 1 / 360;

function probe(kind: CarKind): void {
  const spec = CAR_SPECS[kind];
  const ai = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), AI_PROFILE);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, ai);
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  const marks = [1200, 1700, 1950, 2020, 2300, 4000, 5500];
  const laps = 3;
  let next = 0, lapMarks = 0, peak = 0;
  for (let t = 0; t < 120 * laps && v.stint.completedLaps < laps; t += DT) {
    ap.drive(v, inp);
    v.step(inp, DT);
    for (const x of v.stint.tyres) peak = Math.max(peak, x.tempC);
    const m = marks[next % marks.length];
    if (v.tp.s > m && v.tp.s < m + 50) {
      const ty = v.stint.tyres.map((x) => `${x.tempC.toFixed(0)}C/${x.grip.toFixed(3)}`).join(' ');
      const mean = v.stint.tyres.reduce((a, x) => a + x.tempC, 0) / 4;
      console.log(`${kind} lap${v.stint.completedLaps + 1} s=${v.tp.s.toFixed(0)} t=${t.toFixed(1)} mean=${mean.toFixed(1)}C tyres(temp/grip) FL FR RL RR: ${ty}`);
      next++;
      lapMarks++;
    }
  }
  console.log(`${kind} laps=${v.stint.completedLaps} peak tyre temp ${peak.toFixed(1)}C marks=${lapMarks}`);
}

it('prints the live tyre grip of the torana and the camaro near The Cutting', () => {
  probe('camaro');
  probe('torana');
}, 120000);
