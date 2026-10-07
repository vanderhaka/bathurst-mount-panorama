// Animated fake lap for the harness (?animate=1): a crude curvature-based speed
// profile of the real centreline drives speed, gears, rpm, pedals, timing.
import type { HudState } from '@/types/hud';
import { cornerAt, type DemoTrack, demoState, gearFor, rpmFor } from '@/hud/demo-states';

const LAT_ACCEL = 17.5; // m/s^2 (~1.8 g: a tidy lap, not the limit)
const BRAKE_DECEL = 8.5;
const VMAX = 79; // m/s (~285 km/h)
/** Power-limited drive: wheel power, mass, drag area x air density (Bathurst altitude). */
const DRIVE_W = 380000;
const MASS_KG = 1400;
const DRAG_K = 0.5 * 1.12 * 0.82;

function driveAccel(v: number): number {
  return Math.min(6, DRIVE_W / (MASS_KG * Math.max(v, 5))) - (DRAG_K * v * v) / MASS_KG;
}

/** Speed (m/s) and signed curvature (rad/m, + = left) per outline point. */
function speedProfile(outline: ReadonlyArray<readonly [number, number]>, ds: number): { v: Float64Array; k: Float64Array } {
  const n = outline.length;
  const v = new Float64Array(n);
  const curv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = outline[(i - 4 + n) % n];
    const b = outline[i];
    const c = outline[(i + 4) % n];
    const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    curv[i] = dh / (ds * 4);
    v[i] = Math.min(VMAX, Math.sqrt(LAT_ACCEL / Math.max(Math.abs(curv[i]), 1e-5)));
  }
  // Smooth curvature over ~60 m: the centreline is noisy on the straights.
  const raw = curv.slice();
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -7; k <= 7; k++) sum += raw[(i + k + n) % n];
    curv[i] = sum / 15;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[(i + 1) % n] ** 2 + 2 * BRAKE_DECEL * ds));
    for (let i = 0; i < n; i++) {
      const prev = v[(i - 1 + n) % n];
      v[i] = Math.min(v[i], Math.sqrt(prev * prev + 2 * Math.max(0, driveAccel(prev)) * ds));
    }
  }
  return { v, k: curv };
}

export function createDemoDriver(track: DemoTrack): { step(dt: number): HudState } {
  const outline = track.info.outline;
  const n = outline.length;
  const ds = track.info.lengthM / n;
  const { v, k: curv } = speedProfile(outline, ds);
  const state = demoState('race', track);
  const sectorStarts = [0, ...track.info.sectorStarts];
  let s = 0.05 * track.info.lengthM;
  let lapTime = 6;
  let lapNo = 1;
  let sectorStartTime = 0;
  let prevSector = 0;
  state.lap.sectors = sectorStarts.map(() => ({ timeS: null, bestS: null, state: 'none' as const }));
  // Live tyre/fuel estimate (no fixed overrides) and a 5-light countdown before the lap.
  delete state.tyres;
  delete state.fuel;
  let countdown = 6.2;
  return {
    step(dt: number): HudState {
      if (countdown > 0) {
        countdown -= dt;
        state.startLights = countdown > 0 ? Math.min(5, Math.floor(6.2 - countdown)) : -1;
        state.lap.currentS = lapTime;
        return state;
      }
      const i = Math.floor(s / ds) % n;
      const speed = v[i];
      const ahead = v[(i + 6) % n];
      s += speed * dt;
      lapTime += dt;
      if (s >= track.info.lengthM) {
        s -= track.info.lengthM;
        state.lap.lastS = lapTime;
        state.lap.bestS = state.lap.bestS === null ? lapTime : Math.min(state.lap.bestS, lapTime);
        lapTime = 0;
        lapNo++;
      }
      const progress = s / track.info.lengthM;
      const sector = sectorStarts.reduce((acc, p, k) => (progress >= p ? k : acc), 0);
      if (sector !== prevSector) {
        const done = state.lap.sectors[prevSector];
        done.timeS = lapTime - sectorStartTime;
        done.state = (['overallBest', 'personalBest', 'slower'] as const)[(lapNo + prevSector) % 3];
        sectorStartTime = sector === 0 ? 0 : lapTime;
        prevSector = sector;
      }
      const kmh = speed * 3.6;
      const gear = gearFor(kmh);
      // Accelerations from the profile, as the physics telemetry would report them.
      const gLong = Math.max(-2.3, Math.min(1, (v[(i + 1) % n] ** 2 - speed * speed) / (2 * ds) / 9.81));
      Object.assign(state, {
        speedKmh: kmh,
        rpm: rpmFor(kmh, gear) + Math.sin(lapTime * 30) * 20,
        gear,
        throttle: ahead >= speed - 0.05 ? Math.min(1, 0.55 + (ahead - speed) * 0.6 + 0.35) : 0,
        // Drag and engine braking do part of the work, so the pedal is lighter than the decel.
        brake: gLong < -0.5 ? Math.min(1, (-gLong - 0.45) / 1.8) : 0,
        steer: Math.max(-1, Math.min(1, curv[(i + 3) % n] * 28)),
        gLat: Math.max(-2.3, Math.min(2.3, (speed * speed * curv[i]) / 9.81)),
        gLong,
        absActive: ahead < speed - 1.2,
        progress,
        playerXZ: [outline[i][0], outline[i][1]],
        playerHeading: Math.atan2(outline[(i + 3) % n][0] - outline[i][0], outline[(i + 3) % n][1] - outline[i][1]),
        ghostXZ: [outline[(i + n - 5) % n][0], outline[(i + n - 5) % n][1]],
        ghostProgress: progress - 5 / n,
        cornerName: cornerAt(track, progress),
        elevationM: track.heights[i],
        altitudeAslM: track.baseAslM + track.heights[i],
        fps: 60,
      });
      state.onLimiter = state.rpm >= 7480;
      state.lap.number = lapNo;
      state.lap.currentS = lapTime;
      state.lap.currentSector = sector;
      state.lap.deltaS = Math.sin(lapTime * 0.21) * 0.65;
      let minAhead = Infinity;
      for (let k = 4; k < 75; k += 3) minAhead = Math.min(minAhead, v[(i + k) % n]);
      state.nextCornerSpeedKmh = minAhead < speed - 4 ? Math.round(minAhead * 3.6) : null;
      return state;
    },
  };
}
