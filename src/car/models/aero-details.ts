// Small Gen3 body details seated on the lofted surface with ray probes:
// the louvred bonnet extractor and dive planes (canards) on the front bumper
// corners. (The guard outlets behind the front wheels are painted on the sides.)
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import { makeProbe, type BodyProbe } from '@/car/models/body-probe';
import type { BodyProfile, Outline } from '@/car/models/profile-types';
import { loft } from '@/car/models/geo-utils';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** Surface point (and normal) below (x, z), or null. */
function below(probe: BodyProbe, x: number, z: number): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  return probe.cast(new THREE.Vector3(x, 3, z), DOWN);
}

/** One louvre slat across the guard: a thin plate tilted so its rear edge stands proud. */
function slat(probe: BodyProbe, x0: number, x1: number, z: number, chord: number, rise: number): THREE.BufferGeometry | null {
  const sections: THREE.Vector3[][] = [];
  for (let i = 0; i <= 3; i++) {
    const x = x0 + ((x1 - x0) * i) / 3;
    const front = below(probe, x, z + chord / 2);
    const rear = below(probe, x, z - chord / 2);
    if (!front || !rear) continue;
    const n = front.normal.clone().add(rear.normal).normalize();
    const a = front.point.clone().addScaledVector(n, 0.004);
    const b = rear.point.clone().addScaledVector(n, 0.004 + rise);
    sections.push([a, b, b.clone().addScaledVector(n, -0.006), a.clone().addScaledVector(n, -0.006)]);
  }
  return sections.length >= 2 ? loft(sections, true, true) : null;
}

/** x range of a top-view outline (x, z) along the line at z, or null. */
function spanAt(o: Outline, z: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0; i < o.length; i++) {
    const [xa, za] = o[i];
    const [xb, zb] = o[(i + 1) % o.length];
    if ((za - z) * (zb - z) <= 0 && za !== zb) xs.push(xa + ((xb - xa) * (z - za)) / (zb - za));
  }
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
}

/** Slats across one louvred vent outline (top view), front to back. */
function louvreSet(probe: BodyProbe, o: Outline, count: number, rise: number): THREE.BufferGeometry[] {
  const zs = o.map((v) => v[1]);
  const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / count;
    const span = spanAt(o, z);
    if (!span) continue;
    const g = slat(probe, span[0] + 0.015, span[1] - 0.015, z, ((z1 - z0) / count) * 0.75, rise);
    if (g) out.push(g);
  }
  return out;
}

function louvres(probe: BodyProbe, p: BodyProfile, high: boolean): THREE.BufferGeometry[] {
  const perMetre = high ? 15 : 7;
  const count = (o: Outline) => {
    const zs = o.map((v) => v[1]);
    return Math.max(2, Math.round((Math.max(...zs) - Math.min(...zs)) * perMetre));
  };
  return p.art.bonnetVents.flatMap((o) => louvreSet(probe, o, count(o), 0.012));
}

/** Dive planes: thin plates that wrap the bumper corner and kick up towards the outside. */
function canards(probe: BodyProbe, p: BodyProfile): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    for (const [y, reach] of p.canards) {
      const sections: THREE.Vector3[][] = [];
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Outboard of the corner intakes, on the bumper corner.
        const x = s * (0.8 + t * 0.12);
        const hit = probe.cast(new THREE.Vector3(x, y, 4), new THREE.Vector3(0, 0, -1));
        if (!hit) continue;
        const n = new THREE.Vector3(hit.normal.x, 0, hit.normal.z).normalize();
        const w = reach * (0.55 + 0.45 * t);
        const inner = hit.point.clone().addScaledVector(n, -0.01);
        const outer = hit.point.clone().addScaledVector(n, w).addScaledVector(UP, 0.012 + 0.03 * t);
        sections.push([inner, outer, outer.clone().addScaledVector(UP, -0.007), inner.clone().addScaledVector(UP, -0.007)]);
      }
      if (sections.length >= 2) out.push(loft(sections, true, true));
    }
  }
  return out;
}

/** Guard louvres and canards (black plastic). */
export function buildBodyDetails(grid: BodyGrid, p: BodyProfile, high: boolean): THREE.BufferGeometry[] {
  const top = makeProbe(grid, grid.rowAt.cowl - 1, grid.rows - 1);
  const out = [...louvres(top, p, high), ...canards(top, p)];
  top.dispose();
  return out;
}
