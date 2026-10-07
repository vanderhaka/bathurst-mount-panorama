// Rear aero: diffuser with strakes and the deck-mounted rear wing (cambered
// main plane with a gurney, styled endplates, uprights).
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import { makeProbe } from '@/car/models/body-probe';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, loft, merge } from '@/car/models/geo-utils';

export interface RearAero {
  plastic: THREE.BufferGeometry[];
  wingCarbon: THREE.BufferGeometry;
  wingPlates: THREE.BufferGeometry;
  wingHinge: THREE.Vector3;
}

function diffuser(zTail: number, zStart: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const zT = zTail + 0.1;
  const plate: Array<readonly [number, number]> = [[zStart, 0.074], [zT, 0.18], [zT, 0.195], [zStart, 0.088]];
  out.push(extrude(plate, 1.44, (a, b, d) => [d - 0.72, b, a]));
  for (const x of [-0.72, -0.36, 0, 0.36, 0.72]) {
    const fin: Array<readonly [number, number]> = [[zStart + 0.1, 0.082], [zT, 0.1], [zT, 0.2]];
    out.push(extrude(fin, 0.014, (a, b, d) => [x - 0.007 + d, b, a]));
  }
  return out;
}

/** Inverted (downforce) cambered airfoil section in the (z, y) plane. */
function airfoil(zLE: number, zTE: number, yc: number, aoa: number, n: number): Array<[number, number]> {
  const c = zLE - zTE;
  const thick = (t: number) => 0.13 * c * (2.97 * Math.sqrt(t) - 1.26 * t - 3.52 * t * t + 2.84 * t ** 3 - 1.0 * t ** 4) / 2;
  const camber = (t: number) => -0.07 * c * (t < 0.45 ? (2 * 0.45 * t - t * t) / 0.2025 : (1 - 0.9 + 2 * 0.45 * t - t * t) / 0.3025);
  const pt = (t: number, s: number): [number, number] => {
    const z = zLE - t * c;
    const y = yc + camber(t) + s * thick(t) + (t - 0.5) * c * Math.sin(aoa);
    return [z, y];
  };
  const upper: Array<[number, number]> = [];
  const lower: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = (1 - Math.cos((Math.PI * i) / n)) / 2;
    upper.push(pt(t, 1));
    lower.push(pt(t, -1));
  }
  const gurney: Array<[number, number]> = [[upper[n][0], upper[n][1] + 0.018], [upper[n][0] + 0.004, upper[n][1] + 0.018]];
  return [...upper, ...gurney, ...lower.reverse().slice(0, -1)];
}

function wing(grid: BodyGrid, p: BodyProfile): Omit<RearAero, 'plastic'> {
  const w = p.wing;
  const sec = airfoil(w.zLE, w.zTE, w.y, w.aoa, 8);
  const span = (x: number) => sec.map(([z, y]) => new THREE.Vector3(x, y, z));
  const plane = loft([span(-w.halfSpan), span(w.halfSpan)], true, true);
  const probe = makeProbe(grid, 0, grid.rowAt.rearGlassBase + 2);
  const deckAt = (x: number, z: number) => probe.cast(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0))?.point.y ?? 1.0;
  const [z0, z1] = w.uprightZ;
  const lowerAt = (z: number) => {
    let best = w.y;
    for (const [zz, yy] of sec) if (Math.abs(zz - z) < 0.05) best = Math.min(best, yy);
    return best;
  };
  const parts: THREE.BufferGeometry[] = [plane];
  let deck = 0;
  for (const s of [1, -1]) {
    const x = s * w.uprightX;
    const d0 = deckAt(x, z0), d1 = deckAt(x, z1);
    deck += (d0 + d1) / 4;
    const outline: Array<readonly [number, number]> = [[z0, d0 - 0.03], [z1, d1 - 0.03], [z1 + 0.015, lowerAt(z1) + 0.01], [z0 - 0.05, lowerAt(z0 - 0.05) + 0.01]];
    parts.push(extrude(outline, 0.012, (a, b, d) => [x - 0.006 + d, b, a]));
  }
  probe.dispose();
  const plates = [1, -1].map((s) => extrude(w.endplate, 0.01, (a, b, d) => [s * (w.halfSpan + 0.002 + d), b, a], 0.002));
  return { wingCarbon: merge(parts), wingPlates: merge(plates), wingHinge: new THREE.Vector3(0, deck, (z0 + z1) / 2) };
}

export function buildRearAero(grid: BodyGrid, p: BodyProfile, zTail: number, zDiffuser: number): RearAero {
  return { plastic: diffuser(zTail, zDiffuser), ...wing(grid, p) };
}
