import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { CORNERS } from '@/track/layout';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
// Minimum ideal speed near each named corner: measured car vs the user's tuned car.
it('corner minimum speeds', () => {
  const t = new Track();
  const line = computeRacingLine(t);
  const m = computeSpeedProfile(t, line, CAR_SPECS.camaro);
  const tu = computeSpeedProfile(t, line, tunedSpec(CAR_SPECS.camaro, DEFAULT_HANDLING));
  for (const c of CORNERS) {
    let vm = Infinity, vt = Infinity, r = Infinity;
    for (let s = c.s - 40; s <= c.s + 40; s += 2) {
      const i = Math.round(t.wrapS(s) / t.spacing) % t.n;
      vm = Math.min(vm, m.speed[i] * 3.6); vt = Math.min(vt, tu.speed[i] * 3.6); r = Math.min(r, 1 / Math.abs(line.curvature[i]));
    }
    console.log(`T${String(c.turn).padStart(2)} ${c.name.padEnd(22)} measured ${vm.toFixed(0).padStart(3)}  tuned ${vt.toFixed(0).padStart(3)}  line R ${r.toFixed(0).padStart(4)} m`);
  }
  console.log(`lap: measured ${m.lapTimeS.toFixed(2)} s, tuned ${tu.lapTimeS.toFixed(2)} s`);
});
