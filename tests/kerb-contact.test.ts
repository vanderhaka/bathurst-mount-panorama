import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { KERB_CORNERS } from '@/track/kerb-data';
import { kerbCrossfallAt, kerbHeightAt, taperedKerbWidths } from '@/track/kerb-profile';
import { placeKerbs, type KerbLayout } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { heightAt, surfaceAt } from '@/track/track-query';
import { buildRoad } from '@/world/road';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer;
const checkedTurns = [1, 2, 10, 21, 23];

function draw(layout: KerbLayout): THREE.Group {
  return buildRoad(track, line, layout, renderer, { detailSize: 64, rubberGroove: 0.8, skids: false });
}
function dispose(group: THREE.Group): void {
  group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
}
function compareRing(group: THREE.Group, layout: KerbLayout, i: number, sign: 1 | -1): number {
  const mesh = group.children.filter((o) => o.name === 'kerbs')[sign > 0 ? 0 : 1] as THREE.Mesh<THREE.BufferGeometry>;
  const p = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
  let checked = 0;
  for (let v = 0; v < p.count; v++) {
    const ring = Math.round(uv.getY(v) * 3.2 / track.spacing) % track.n;
    if (ring !== i || v % 9 === 0 || v % 9 === 8) continue;
    const d = (p.getX(v) - track.px[i]) * track.lx[i] + (p.getZ(v) - track.pz[i]) * track.lz[i];
    expect(surfaceAt(track, i, 0, d, layout.left, layout.right)).toBe('kerb');
    expect(kerbHeightAt(track, layout, i, 0, d)).toBeCloseTo(p.getY(v), 3);
    checked++;
  }
  return checked;
}

function driveAcrossKerb(raised: boolean): { maxLoad: number; maxRollRate: number; sawKerb: boolean } {
  const custom: KerbLayout = { ...kerbs, leftType: Uint8Array.from(kerbs.leftType, () => raised ? 1 : 0) };
  const v = new Vehicle(CAR_SPECS.camaro, track, custom);
  const i = Math.round(5588 / track.spacing), edge = track.left.edge[i];
  v.reset(i * track.spacing, edge - 1.3);
  v.heading += 0.15;
  const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  // Settle the rotated entry pose before measuring contact, avoiding a reset damper transient.
  for (let k = 0; k < 360; k++) v.step(input, 1 / 360);
  v.vx = Math.sin(v.heading) * 26;
  v.vz = Math.cos(v.heading) * 26;
  let maxLoad = 0, maxRollRate = 0, sawKerb = false;
  for (let k = 0; k < 180; k++) {
    v.step(input, 1 / 360);
    if (v.wheels.some((w) => w.surface === 'kerb')) {
      maxLoad = Math.max(maxLoad, ...v.wheels.map((w) => w.load));
      maxRollRate = Math.max(maxRollRate, Math.abs(v.rollRate));
      sawKerb = true;
    }
  }
  return { maxLoad, maxRollRate, sawKerb };
}

describe('shared corner kerb contact', () => {
  it('records the five checked inside corners and distinguishes usable flat from raised profiles', () => {
    expect(KERB_CORNERS.map((c) => c.turn)).toEqual(checkedTurns);
    for (const c of KERB_CORNERS) {
      const corner = track.corners.find((p) => p.turn === c.turn)!;
      const i = Math.round(corner.s / track.spacing), widths = corner.dir === 'L' ? kerbs.left : kerbs.right;
      const types = corner.dir === 'L' ? kerbs.leftType : kerbs.rightType;
      const side = corner.dir === 'L' ? track.left : track.right;
      expect(widths[i]).toBeCloseTo(Math.min(c.width, side.wall[i] - side.edge[i] - 0.3), 2);
      expect(types[i]).toBe(c.type === 'raised' ? 1 : 0);
      expect(c.reference).toContain('NSW');
      expect(c.heightEstimate).toBe(true);
    }
    const chase = KERB_CORNERS.find((c) => c.turn === 21)!;
    expect(chase.width).toBe(2);
    expect(KERB_CORNERS.some((c) => c.type === 'raised')).toBe(true);
    expect(KERB_CORNERS.some((c) => c.type === 'flat')).toBe(true);
  });

  for (const turn of checkedTurns) it(`matches the real mesh and physical surface at referenced turn ${turn}`, () => {
    const c = track.corners.find((p) => p.turn === turn)!;
    const i = Math.round(c.s / track.spacing), sign = c.dir === 'L' ? 1 : -1;
    const group = draw(kerbs);
    expect(compareRing(group, kerbs, i, sign)).toBe(7);
    const widths = sign > 0 ? kerbs.left : kerbs.right, side = sign > 0 ? track.left : track.right;
    const d = sign * (side.edge[i] + widths[i] * 0.25);
    const lift = kerbHeightAt(track, kerbs, i, 0, d) - heightAt(track, i, 0, sign * side.edge[i]);
    expect(lift).toBeGreaterThan(0.005);
    expect(lift).toBeLessThan(turn === 21 ? 0.09 : 0.02);
    dispose(group);
  });

  it('uses the rendered taper for surface classification instead of a full-width invisible kerb', () => {
    const i = Array.from(kerbs.left).findIndex((w, k) => w > 0.05 && kerbs.left[track.wrap(k - 1)] === 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const group = draw(kerbs);
    expect(compareRing(group, kerbs, i, 1)).toBe(7);
    expect(kerbs.left[i]).toBeLessThan(0.5);
    const edge = track.left.edge[i], d = edge + kerbs.left[i] + 0.02;
    expect(surfaceAt(track, i, 0, d, kerbs.left, kerbs.right)).not.toBe('kerb');
    expect(kerbHeightAt(track, kerbs, i, 0, d)).toBe(heightAt(track, i, 0, d));
    dispose(group);
  });

  it('draws the end cap through the same longitudinal interval sampled by physics', () => {
    const i = Array.from(kerbs.left).findIndex((w, k) => w > 0.1 && kerbs.left[track.wrap(k + 1)] === 0);
    expect(i).toBeGreaterThanOrEqual(0);
    const next = track.wrap(i + 1), group = draw(kerbs);
    const mesh = group.children.filter((o) => o.name === 'kerbs')[0] as THREE.Mesh<THREE.BufferGeometry>;
    const uv = mesh.geometry.getAttribute('uv');
    const rings = Array.from({ length: uv.count }, (_, v) => Math.round(uv.getY(v) * 3.2 / track.spacing) % track.n);
    expect(rings).toContain(next);
    const edge = (track.left.edge[i] + track.left.edge[next]) / 2;
    expect(surfaceAt(track, i, 0.5, edge + kerbs.left[i] / 8, kerbs.left, kerbs.right)).toBe('kerb');
    dispose(group);
  });

  it('joins a flat kerb to the road without a vertical step', () => {
    const i = Math.round(3039 / track.spacing), edge = track.left.edge[i];
    expect(kerbHeightAt(track, kerbs, i, 0, edge + 1e-6) - heightAt(track, i, 0, edge)).toBeLessThan(1e-6);
  });

  it('tapers a run continuously across the lap seam and blends sample heights', () => {
    const widths = new Float32Array(track.n);
    for (let k = -7; k <= 7; k++) widths[track.wrap(k)] = 2;
    const tapered = taperedKerbWidths(widths);
    expect(tapered[0]).toBe(2);
    expect(tapered[track.n - 1]).toBe(2);
    expect(tapered[track.n - 7]).toBeLessThan(tapered[track.n - 6]);
    const custom: KerbLayout = { ...kerbs, left: tapered, leftType: new Uint8Array(track.n).fill(1) };
    const d = track.left.edge[0] + 0.5;
    const a = kerbHeightAt(track, custom, track.n - 1, 1, d), b = kerbHeightAt(track, custom, 0, 0, d);
    expect(a).toBeCloseTo(b, 8);
    expect(kerbHeightAt(track, custom, 0, 0.5, d)).toBeGreaterThan(heightAt(track, 0, 0.5, d));
  });

  it('keeps road and verge heights unchanged outside the drawn kerb', () => {
    const i = Math.round(5588 / track.spacing);
    for (const d of [0, track.left.edge[i] - 0.1, track.left.edge[i] + kerbs.left[i] + 1]) {
      expect(kerbHeightAt(track, kerbs, i, 0, d)).toBe(heightAt(track, i, 0, d));
    }
  });

  it('uses the profile slope for ground reaction on both sides, retaining the road and verge slope', () => {
    const i = Math.round(5588 / track.spacing), w = kerbs.left[i], d = track.left.edge[i] + w * 0.125;
    const h = 0.001;
    const slope = (kerbHeightAt(track, kerbs, i, 0, d + h) - kerbHeightAt(track, kerbs, i, 0, d - h)) / (2 * h);
    expect(kerbCrossfallAt(track, kerbs, i, 0, d)).toBeCloseTo(slope, 6);
    const mirrored: KerbLayout = { ...kerbs, right: kerbs.left, rightType: kerbs.leftType };
    expect(kerbCrossfallAt(track, mirrored, i, 0, -(track.right.edge[i] + w * 0.125))).toBeCloseTo(-slope, 6);
    expect(kerbCrossfallAt(track, kerbs, i, 0, 0)).toBeCloseTo(Math.tan(track.bank[i]), 8);
    expect(kerbCrossfallAt(track, kerbs, i, 0, d + w + 1)).toBe(-0.035);
  });

  it('unsettles actual suspension more on a raised profile than the same flat kerb', () => {
    const flat = driveAcrossKerb(false), raised = driveAcrossKerb(true);
    console.log(JSON.stringify({ flat, raised }));
    expect(flat.sawKerb && raised.sawKerb).toBe(true);
    expect(raised.maxLoad).toBeGreaterThan(flat.maxLoad * 1.15);
    expect(raised.maxRollRate).toBeGreaterThan(flat.maxRollRate * 1.15);
  });
});
