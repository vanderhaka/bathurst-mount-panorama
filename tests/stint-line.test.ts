import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { AttractMode } from '@/game/attract-mode';
import type { CarEntity } from '@/game/car-entity';
import { SessionProfiles } from '@/game/session-profiles';
import type { VehicleInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const DT = 1 / 360;
const circuits = [['Adelaide', createAdelaideTrack()], ['Bathurst', new Track()]] as const;
const layouts = new Map(circuits.map(([, track]) => {
  const line = computeRacingLine(track);
  return [track, { line, kerbs: placeKerbs(track, line) }];
}));
const idle = (): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false });

function car(track: Track): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, layouts.get(track)!.kerbs);
  v.stint.reset({ tempC: 95 });
  return v;
}

/** Steps the stint alone from lap distance `from` to `to` (metres past the line) in small forward steps. */
function roll(v: Vehicle, track: Track, from: number, to: number): void {
  for (let d = from; d <= to; d += 10) v.stint.advance(v.telemetry, 0.2, track.wrapS(track.startLineS + d), track.startLineS, track.length);
}

describe('stint laps are counted at the timing line in wrapped lap distance', () => {
  for (const [name, track] of circuits) {
    it(`${name}: counts each forward crossing once, but not a reverse back over the line and forward again`, () => {
      const v = car(track), line = track.startLineS, at = (d: number) => track.wrapS(line + d);
      v.stint.placeOnTrack(at(-1));
      v.stint.advance(v.telemetry, 0.1, at(1), line, track.length);
      expect(v.stint.completedLaps).toBe(1);
      v.stint.advance(v.telemetry, 0.1, at(-1), line, track.length);
      v.stint.advance(v.telemetry, 0.1, at(1), line, track.length);
      expect(v.stint.completedLaps).toBe(1);
      roll(v, track, 1, track.length - 5);
      expect(v.stint.completedLaps).toBe(1);
      roll(v, track, track.length - 5, track.length + 5);
      expect(v.stint.completedLaps).toBe(2);
    });

    it(`${name}: counts real AI laps from the grid and reports fuel laps left`, () => {
      const { line } = layouts.get(track)!;
      const v = car(track);
      v.reset(track.gridLineS - 7, -2.2);
      const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai), input = idle();
      let driven = 0, previous = v.tp.s;
      const toLine = track.wrapS(track.startLineS - v.tp.s);
      while (driven < toLine + 2 * track.length + 20) {
        profiles.update();
        ap.drive(v, input);
        v.step(input, DT);
        let ds = v.tp.s - previous;
        if (ds > track.length / 2) ds -= track.length;
        else if (ds <= -track.length / 2) ds += track.length;
        driven += ds;
        previous = v.tp.s;
      }
      expect(v.stint.completedLaps).toBe(3);
      expect(v.stint.fuel.lapsLeft).not.toBeNull();
      expect(v.stint.fuel.lapsLeft!).toBeGreaterThan(5);
    });
  }

  it('refits the title-screen demo car each lap on Adelaide', () => {
    const track = circuits[0][1], { line } = layouts.get(track)!;
    const vehicle = new Vehicle(CAR_SPECS.camaro, track, layouts.get(track)!.kerbs);
    vehicle.reset(900, line.offset[Math.round(900 / track.spacing)]);
    const entity = {
      vehicle, model: { root: new THREE.Object3D(), dispose() {} }, sync() {},
      simulate: (input: VehicleInput, dt: number, step?: (input: VehicleInput) => void) => { step?.(input); return vehicle.step(input, dt); },
    } as unknown as CarEntity;
    const attract = new AttractMode(new THREE.Scene(), new THREE.PerspectiveCamera());
    attract.set(entity, line);
    let refits = 0, previous = vehicle.stint.fuel.litres;
    for (let k = 0; k < 360 * 200 && refits < 2; k++) {
      attract.frame(DT, true, () => {}, new THREE.Vector3());
      if (vehicle.stint.fuel.litres > previous + 0.5) refits++;
      previous = vehicle.stint.fuel.litres;
    }
    expect(refits).toBe(2);
  });
});
