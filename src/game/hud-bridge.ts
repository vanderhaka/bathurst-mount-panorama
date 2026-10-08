import type { CarKind } from '@/car/car-specs';
import type { RaceSession } from '@/game/race-session';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import { CIRCUITS } from '@/track/circuits';
import type { HudState, HudTrackInfo } from '@/types/hud';
import type { Settings } from '@/types/session';

/** Three-letter car code in the timing tower. */
const CAR_CODES: Record<CarKind, string> = { camaro: 'CAM', mustang: 'MUS', supra: 'SUP' };

export function hudTrackInfo(track: Track): HudTrackInfo {
  const outline: Array<[number, number]> = [];
  // Rotate so that index 0 is the timing line (lap fraction 0).
  const i0 = Math.round(track.startLineS / track.spacing);
  for (let k = 0; k < track.n; k++) {
    const i = (i0 + k) % track.n;
    outline.push([track.px[i], track.pz[i]]);
  }
  return {
    name: track.name, city: CIRCUITS[track.id].city, elevationEstimated: track.id === 'adelaide',
    outline,
    sectorStarts: track.sectorStarts.map((s) => track.lapFraction(s)),
    corners: track.corners.map((c) => ({ progress: track.lapFraction(c.s), name: c.name, place: track.placeAt(c.s), turn: c.turn })),
    lengthM: track.length,
  };
}

/**
 * Recommended speed (km/h) for the next corner, from the racing-line profile: the minimum
 * of the next speed dip, shown only when that minimum is within 450 m. The search runs far
 * enough (up to 900 m) to reach the real minimum, not a point partway down the braking zone.
 */
export function nextCornerSpeed(track: Track, profile: SpeedProfile, s: number, speed: number): number | null {
  const i0 = Math.floor(track.wrapS(s) / track.spacing);
  const steps = Math.round(900 / track.spacing);
  let min = Infinity, minK = -1;
  for (let k = 4; k < steps; k++) {
    const v = profile.speed[(i0 + k) % track.n];
    if (v < min) { min = v; minK = k; }
    else if (minK >= 0 && v > min + 3) break; // passed the corner's minimum
  }
  // No dip ahead (the profile only rises from here), or the corner is still far away.
  if (minK <= 5 || minK * track.spacing > 450) return null;
  const target = min * 0.97;
  if (target > speed * 0.93 || target > 75) return null;
  return Math.round(target * 3.6);
}

export function buildHudState(session: RaceSession, profile: SpeedProfile, settings: Settings, fps: number | null, out: HudState | null): HudState {
  const v = session.entity.vehicle;
  const t = v.telemetry;
  const track = session.track;
  const e = v.spec.engine;
  const snap = session.timer.snapshot(session.lapDist());
  const d = v.damage;
  const state: HudState = out ?? ({} as HudState);
  state.units = settings.units;
  state.hudSize = settings.hudSize;
  state.speedKmh = Math.abs(t.speed) * 3.6;
  state.rpm = t.rpm;
  state.maxRpm = e.limiterRpm;
  state.shiftLightStartRpm = e.redlineRpm - 1700;
  state.shiftRpm = e.redlineRpm - 100;
  state.gear = t.gear;
  state.gearMode = settings.autoGears ? 'auto' : 'manual';
  state.onLimiter = t.onLimiter;
  state.throttle = t.throttle;
  state.brake = t.brake;
  state.steer = t.steer;
  state.tcActive = t.tcActive;
  state.absActive = t.absActive;
  state.lap = {
    number: snap.lapNumber,
    currentS: snap.currentS,
    lastS: snap.lastS,
    bestS: snap.bestS,
    deltaS: snap.deltaS,
    valid: snap.valid,
    currentSector: snap.currentSector,
    sectors: snap.sectors,
  };
  state.progress = track.lapFraction(v.tp.s);
  state.ghostProgress = session.ghostVisible ? progressOf(session) : null;
  state.playerXZ = [v.x, v.z];
  state.playerHeading = v.heading;
  state.ghostXZ = session.ghostVisible ? [session.ghostPose.x, session.ghostPose.z] : null;
  state.cornerName = track.placeAt(v.tp.s);
  state.elevationM = v.y - v.spec.cgHeight;
  state.altitudeAslM = v.y - v.spec.cgHeight + track.elevationBaseM;
  state.nextCornerSpeedKmh = nextCornerSpeed(track, profile, v.tp.s, Math.abs(v.speed));
  state.damage = { front: d.front, rear: d.rear, left: d.left, right: d.right, engine: d.engine, suspension: d.suspension, aero: d.aero };
  state.message = session.currentMessage();
  state.fps = fps;
  state.startLights = session.lights;
  state.gLat = t.gLat;
  state.gLong = t.gLong;
  state.wheels = t.wheels;
  state.fuel = t.fuel;
  state.tyres = t.tyres;
  state.brakes = t.brakes;
  state.tyreCompound = v.stint.tyreModel.compound;
  if (!state.entry) {
    const lv = session.entity.livery;
    state.entry = { number: lv.number, code: CAR_CODES[session.car], colour: `#${lv.primary.toString(16).padStart(6, '0')}` };
  }
  return state;
}

function progressOf(session: RaceSession): number | null {
  // The ghost's progress is approximated from its world position (cheap nearest sample).
  const track = session.track;
  const i = track.nearestIndex(session.ghostPose.x, session.ghostPose.z);
  return track.lapFraction(i * track.spacing);
}
