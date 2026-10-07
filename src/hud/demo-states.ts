// Demo HUD states for the harness: fixed presets and an animated fake lap
// driven by a crude speed profile of the real centreline.
import { CAR_SPECS } from '@/car/car-specs';
import type { HudState, HudTrackInfo, SectorState } from '@/types/hud';

export interface DemoTrack {
  info: HudTrackInfo;
  /** Height of each outline point above the lowest point (m). */
  heights: number[];
  baseAslM: number;
}

export type DemoPreset = 'race' | 'slow' | 'invalid' | 'damage' | 'limiter' | 'mph' | 'lights' | 'noref';

const SPEC = CAR_SPECS.camaro;
const NO_DAMAGE: HudState['damage'] = { front: 0, rear: 0, left: 0, right: 0, engine: 0, suspension: 0, aero: 0 };

function pose(track: DemoTrack, progress: number): { xz: [number, number]; heading: number; i: number } {
  const pts = track.info.outline;
  const n = pts.length;
  const i = Math.floor((((progress % 1) + 1) % 1) * n) % n;
  const a = pts[i];
  const b = pts[(i + 3) % n];
  return { xz: [a[0], a[1]], heading: Math.atan2(b[0] - a[0], b[1] - a[1]), i };
}

export function cornerAt(track: DemoTrack, progress: number): string | null {
  for (const c of track.info.corners) if (progress >= c.progress - 0.004 && progress <= c.progress + 0.012) return c.name;
  return null;
}

/** Engine rpm for a speed in a gear (1-based). */
export function rpmFor(speedKmh: number, gear: number): number {
  const wheelRps = speedKmh / 3.6 / (2 * Math.PI * SPEC.dimensions.wheelRadius);
  return Math.max(SPEC.engine.idleRpm, wheelRps * 60 * SPEC.gearRatios[gear - 1] * SPEC.finalDrive);
}

export function gearFor(speedKmh: number): number {
  for (let g = 1; g <= SPEC.gearRatios.length; g++) if (rpmFor(speedKmh, g) < 7150) return g;
  return SPEC.gearRatios.length;
}

function base(track: DemoTrack, progress: number, speedKmh: number): HudState {
  const p = pose(track, progress);
  const gear = gearFor(speedKmh);
  return {
    units: 'kmh',
    speedKmh,
    rpm: rpmFor(speedKmh, gear),
    maxRpm: SPEC.engine.limiterRpm,
    shiftLightStartRpm: 5600,
    shiftRpm: 7200,
    gear,
    gearMode: 'auto',
    onLimiter: false,
    throttle: 0.86,
    brake: 0,
    steer: 0.1,
    tcActive: false,
    absActive: false,
    lap: { number: 3, currentS: 0, lastS: 125.441, bestS: 124.903, deltaS: 0, valid: true, currentSector: 0, sectors: [] },
    progress,
    ghostProgress: progress - 0.004,
    playerXZ: p.xz,
    playerHeading: p.heading,
    ghostXZ: pose(track, progress - 0.004).xz,
    cornerName: cornerAt(track, progress),
    elevationM: track.heights[p.i],
    altitudeAslM: track.baseAslM + track.heights[p.i],
    nextCornerSpeedKmh: null,
    damage: { ...NO_DAMAGE },
    message: null,
    fps: null,
    entry: { number: 97, code: 'CAM', colour: '#c8102e' },
    startLights: -1,
    tyres: tyreSet(88, 92, 84, 86, 0.06),
    fuel: { litres: 84.6, lapsLeft: 21.7 },
  };
}

/** Fixed tyre readings for the static presets (the live estimate needs time to run). */
function tyreSet(fl: number, fr: number, rl: number, rr: number, wear: number): HudState['tyres'] {
  return [fl, fr, rl, rr].map((tempC, i) => ({ tempC, wear: wear + i * 0.01 }));
}

function sectors(states: SectorState[], times: Array<number | null>): HudState['lap']['sectors'] {
  return states.map((state, i) => ({ timeS: times[i], bestS: null, state }));
}

export function demoState(preset: DemoPreset, track: DemoTrack): HudState {
  switch (preset) {
    case 'slow': {
      const s = base(track, 0.74, 236);
      s.lap = { ...s.lap, currentS: 92.876, deltaS: 1.205, currentSector: 2, sectors: sectors(['slower', 'slower', 'none'], [42.391, 41.104, null]) };
      s.ghostXZ = pose(track, 0.758).xz;
      s.nextCornerSpeedKmh = 214;
      s.tyres = tyreSet(109, 117, 96, 101, 0.31);
      s.fuel = { litres: 7.4, lapsLeft: 1.9 };
      return s;
    }
    case 'invalid': {
      const s = base(track, 0.165, 214);
      s.lap = { ...s.lap, currentS: 24.613, deltaS: 0.448, valid: false, currentSector: 0, sectors: sectors(['none', 'none', 'none'], [null, null, null]) };
      s.message = { text: 'Track limits — lap invalidated', kind: 'warn' };
      s.cornerName = null;
      return s;
    }
    case 'damage': {
      const s = base(track, 0.43, 96);
      s.throttle = 0.35;
      s.steer = -0.42;
      s.damage = { front: 0.82, rear: 0.28, left: 0.56, right: 0.12, engine: 0.45, suspension: 0.68, aero: 0.92 };
      s.tyres = tyreSet(74, 81, 69, 72, 0.12);
      s.lap = { ...s.lap, currentS: 58.904, deltaS: 6.874, currentSector: 1, sectors: sectors(['personalBest', 'none', 'none'], [41.533, null, null]) };
      s.message = { text: 'Heavy impact — aero and suspension damaged', kind: 'warn' };
      return s;
    }
    case 'lights': {
      const s = base(track, 0.998, 0);
      s.gear = 1;
      s.rpm = 4200;
      s.throttle = 0.4;
      s.steer = 0;
      s.startLights = 3;
      s.lap = { ...s.lap, number: 0, currentS: 3.1, lastS: null, deltaS: null, currentSector: 0, sectors: sectors(['none', 'none', 'none'], [null, null, null]) };
      s.tyres = tyreSet(52, 53, 49, 50, 0);
      s.fuel = { litres: 110, lapsLeft: null };
      s.ghostXZ = null;
      return s;
    }
    case 'noref': {
      // First timed lap of a new session: no best lap, so no reference or ghost yet.
      const s = base(track, 0.31, 204);
      s.lap = { ...s.lap, number: 1, currentS: 44.12, lastS: null, bestS: null, deltaS: null, currentSector: 1, sectors: sectors(['none', 'none', 'none'], [42.871, null, null]) };
      s.ghostXZ = null;
      s.ghostProgress = null;
      s.tyres = tyreSet(79, 84, 76, 80, 0.004);
      s.fuel = { litres: 106.8, lapsLeft: null };
      return s;
    }
    case 'limiter': {
      const s = base(track, 0.09, 0);
      s.gear = 3;
      s.speedKmh = 176;
      s.rpm = SPEC.engine.limiterRpm;
      s.onLimiter = true;
      s.gearMode = 'manual';
      s.throttle = 1;
      s.tcActive = true;
      s.lap = { ...s.lap, currentS: 12.106, deltaS: -0.087, currentSector: 0, sectors: sectors(['none', 'none', 'none'], [null, null, null]) };
      s.message = { text: 'Shift up', kind: 'info' };
      return s;
    }
    case 'mph': {
      const s = base(track, 0.024, 251);
      s.units = 'mph';
      s.lap = { ...s.lap, number: 4, currentS: 3.208, lastS: 124.512, bestS: 124.512, deltaS: -0.391, currentSector: 0, sectors: sectors(['none', 'overallBest', 'personalBest'], [null, 43.016, 40.288]) };
      s.message = { text: 'New best lap  2:04.512', kind: 'best' };
      s.fps = 60;
      return s;
    }
    default: {
      const s = base(track, 0.452, 187);
      s.lap = { ...s.lap, currentS: 62.418, deltaS: -0.312, currentSector: 1, sectors: sectors(['overallBest', 'none', 'none'], [41.208, null, null]) };
      s.nextCornerSpeedKmh = 112;
      s.brake = 0;
      s.fps = 60;
      return s;
    }
  }
}
