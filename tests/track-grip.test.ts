import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { Vehicle } from '@/physics/vehicle';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine, type RacingLine } from '@/track/racing-line';
import { TrackGrip } from '@/track/rubber-line';
import { Track } from '@/track/track-model';
import { buildRoad } from '@/world/road';

const track = new Track(), line = computeRacingLine(track);
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer;
const shifted = (d: number): RacingLine => ({ ...line, offset: new Float32Array(track.n).fill(d) });

function car(d: number): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, shifted(d)));
  v.stint.reset({ tempC: 95 });
  v.reset(180, 0);
  v.vx = Math.sin(v.heading) * 30 + Math.cos(v.heading) * 3;
  v.vz = Math.cos(v.heading) * 30 - Math.sin(v.heading) * 3;
  return v;
}

describe('rubbered racing-line grip', () => {
  it('has less grip four metres from the rendered line and leaves other surfaces alone', () => {
    const grip = new TrackGrip(track, line);
    const i = Math.round(450 / track.spacing), d = line.offset[i];
    expect(grip.at(i, 0, d, 'road')).toBeGreaterThan(grip.at(i, 0, d + 4, 'road') + 0.01);
    for (const surface of ['kerb', 'grass', 'gravel', 'asphalt', 'concrete'] as const) expect(grip.at(i, 0, d, surface)).toBe(1);
  });

  it('interpolates the actual line across a sample and the lap seam', () => {
    const custom = shifted(0);
    custom.offset[track.n - 1] = -3;
    custom.offset[0] = 3;
    const grip = new TrackGrip(track, custom);
    expect(grip.at(track.n - 1, 0.5, 0, 'road')).toBeGreaterThan(grip.at(track.n - 1, 0.5, 3, 'road') + 0.01);
    expect(grip.at(track.n - 1, 0, -3, 'road')).toBeCloseTo(grip.at(0, 0, 3, 'road'), 8);
  });

  it('builds line grip through driving time, independently of timestep partition, and caps it', () => {
    const grip = new TrackGrip(track, shifted(0)), split = new TrackGrip(track, shifted(0));
    const initial = grip.at(30, 0, 0, 'road');
    grip.advance(600, 30);
    for (let i = 0; i < 600; i++) split.advance(1, 30);
    expect(grip.at(30, 0, 0, 'road')).toBeGreaterThan(initial);
    expect(grip.at(30, 0, 0, 'road')).toBeCloseTo(split.at(30, 0, 0, 'road'), 8);
    grip.advance(1e6, 30);
    const full = grip.at(30, 0, 0, 'road');
    expect(full).toBeLessThanOrEqual(1.03);
    grip.advance(1e6, 30);
    expect(grip.at(30, 0, 0, 'road')).toBe(full);
    grip.reset();
    expect(grip.at(30, 0, 0, 'road')).toBe(initial);
  });

  it('does not rubber in while stationary, paused or given invalid elapsed time', () => {
    const grip = new TrackGrip(track, shifted(0));
    const initial = grip.at(30, 0, 0, 'road');
    for (const dt of [0, -1, NaN, Infinity]) grip.advance(dt, 30);
    grip.advance(1200, 0);
    grip.advance(1200, NaN);
    expect(grip.at(30, 0, 0, 'road')).toBe(initial);
  });

  it('uses the same shifted placement in mesh rubber and physics, including asymmetrical road widths', () => {
    const custom = shifted(2.5);
    const grip = new TrackGrip(track, custom);
    const group = buildRoad(track, custom, placeKerbs(track, custom), renderer, { detailSize: 64, rubberGroove: 0.8, skids: false });
    const road = group.getObjectByName('road-surface') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const p = road.geometry.getAttribute('position'), rubber = road.geometry.getAttribute('roadRubber');
    const clean = grip.at(30, 0, -20, 'road'), onLine = grip.at(30, 0, 2.5, 'road');
    for (let i = 0; i < track.n; i += 37) for (let lane = 0; lane <= 12; lane++) {
      const v = i * 13 + lane;
      const d = (p.getX(v) - track.px[i]) * track.lx[i] + (p.getZ(v) - track.pz[i]) * track.lz[i];
      expect(grip.at(i, 0, d, 'road')).toBeCloseTo(clean + (onLine - clean) * rubber.getX(v) / 0.8, 5);
    }
    group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  });

  it('applies the line factor to actual wheel forces while ground, load, tyres and handling are identical', () => {
    const rubber = car(0), dirty = car(4);
    const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
    rubber.step(input, 1 / 360);
    dirty.step(input, 1 / 360);
    expect(rubber.wheels.every((w) => w.surface === 'road')).toBe(true);
    expect(rubber.wheels.map((w) => w.load)).toEqual(dirty.wheels.map((w) => w.load));
    expect(Math.abs(rubber.telemetry.gLat)).toBeGreaterThan(Math.abs(dirty.telemetry.gLat));
    expect(rubber.trackGrip.at(30, 0, 0, 'road')).toBeGreaterThan(new TrackGrip(track, shifted(0)).at(30, 0, 0, 'road'));
  });

  it('preserves rubber on reset-to-track but starts a fresh race with the initial line condition', () => {
    const v = car(0);
    const initial = v.trackGrip.at(30, 0, 0, 'road');
    v.trackGrip.advance(600, 30);
    const used = v.trackGrip.at(30, 0, 0, 'road');
    v.reset(1000, 0);
    expect(v.trackGrip.at(30, 0, 0, 'road')).toBe(used);
    const entity = { vehicle: v, reset: (s: number, d: number) => v.reset(s, d), repair: () => v.repair() } as unknown as CarEntity;
    new RaceSession('camaro', track, shifted(0), entity).placeOnGrid();
    expect(v.trackGrip.at(30, 0, 0, 'road')).toBe(initial);
  });
});
