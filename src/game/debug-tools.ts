import * as THREE from 'three';
import type { RaceController } from '@/game/race-controller';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import type { SpeedProfile } from '@/track/speed-profile';
import type { World } from '@/world/world';

/** Metres the car drives (instantly) before it reaches the teleport point, so that it arrives settled. */
const RUN_UP = 200;
/** The run-up starts below the profile speed: a car dropped into a corner at full speed with no roll or yaw spins. */
const RUN_UP_SPEED = 0.7;

/**
 * Verification helper: puts the player at distance s on the racing line at the
 * profile speed, skips the start lights and invalidates the lap (a teleported lap
 * is never a real lap). The car starts RUN_UP metres earlier, below the profile
 * speed, and drives there at once, so that it arrives settled at speed.
 */
export function teleport(race: RaceController, world: World, profile: SpeedProfile, s: number): void {
  const session = race.session;
  const track = world.track;
  const s0 = track.wrapS(s - RUN_UP);
  const i = Math.round(s0 / track.spacing) % track.n;
  race.player.reset(s0, world.line.offset[i]);
  const v = race.player.vehicle;
  const sp = profile.speed[i] * RUN_UP_SPEED;
  v.vx = Math.sin(v.heading) * sp;
  v.vz = Math.cos(v.heading) * sp;
  v.vy = sp * track.grade[i];
  v.pt.gear = Math.max(1, Math.min(v.spec.gearRatios.length, Math.round(sp / 14)));
  const pilot = new Autopilot(track, world.line, profile);
  const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  const driven = () => {
    const ds = v.tp.s - s0;
    return ds < -track.length / 2 ? ds + track.length : ds > track.length / 2 ? ds - track.length : ds;
  };
  for (let k = 0; k < 900 && driven() < RUN_UP; k++) race.player.simulate(input, 1 / 60, (inp) => pilot.drive(v, inp));
  race.player.sync(0);
  if (!session.racing) {
    session.lights = -1;
    session.timer.lapNumber = 1;
  }
  session.timer.invalidate();
}

/** Car-select camera: slow orbit, with the projection shifted so that the car sits right of the menu panel. */
export function orbitCamera(cam: THREE.PerspectiveCamera, target: THREE.Vector3, angle: number): void {
  const dist = 8.6;
  cam.position.set(target.x + Math.sin(angle) * dist, target.y + 1.7, target.z + Math.cos(angle) * dist);
  cam.lookAt(target.x, target.y + 0.55, target.z);
  cam.fov = 34;
  // Offset in units of the view (camera aspect), not the window: the game area can differ.
  const w = 1000 * cam.aspect, h = 1000;
  cam.setViewOffset(w, h, -w * 0.17, 0, w, h);
  cam.updateProjectionMatrix();
}
