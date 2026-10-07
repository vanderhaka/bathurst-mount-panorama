// Head and tail lights: 2D outlines from the profile, triangulated, subdivided
// and projected onto the lofted nose/tail so the lenses follow the surface.
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import { makeProbe, type BodyProbe } from '@/car/models/body-probe';
import type { BodyProfile, Outline } from '@/car/models/profile-types';

export interface LightSet {
  head: THREE.Mesh;
  tail: THREE.Mesh;
  /** Centres of [left, right] lights (model frame). */
  headCentres: THREE.Vector3[];
  tailCentres: THREE.Vector3[];
}

function resample(o: Outline, maxEdge: number): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < o.length; i++) {
    const [a0, b0] = o[i];
    const [a1, b1] = o[(i + 1) % o.length];
    const k = Math.max(1, Math.ceil(Math.hypot(a1 - a0, b1 - b0) / maxEdge));
    for (let j = 0; j < k; j++) out.push(new THREE.Vector2(a0 + ((a1 - a0) * j) / k, b0 + ((b1 - b0) * j) / k));
  }
  return out;
}

type Tri = [THREE.Vector2, THREE.Vector2, THREE.Vector2];

function subdivide(tris: Tri[], levels: number): Tri[] {
  let cur = tris;
  for (let l = 0; l < levels; l++) {
    const next: Tri[] = [];
    for (const [a, b, c] of cur) {
      const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c).multiplyScalar(0.5), ca = c.clone().add(a).multiplyScalar(0.5);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    cur = next;
  }
  return cur;
}

/** Projects one outline onto the body along z and returns a lens geometry (positions only). */
function lens(o: Outline, probe: BodyProbe, dirZ: number, levels: number, out: number[], centre: THREE.Vector3): void {
  const contour = resample(o, 0.06);
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const tris = subdivide(faces.map(([i, j, k]) => [contour[i], contour[j], contour[k]] as Tri), levels);
  const cache = new Map<string, THREE.Vector3>();
  let lastZ = dirZ < 0 ? 2.3 : -2.5;
  const project = (v: THREE.Vector2) => {
    const key = `${v.x.toFixed(5)},${v.y.toFixed(5)}`;
    let p = cache.get(key);
    if (!p) {
      const hit = probe.cast(new THREE.Vector3(v.x, v.y, -dirZ * 6), new THREE.Vector3(0, 0, dirZ));
      p = hit ? hit.point.addScaledVector(hit.normal, 0.007) : new THREE.Vector3(v.x, v.y, lastZ);
      lastZ = p.z;
      cache.set(key, p);
      centre.add(p);
    }
    return p;
  };
  for (const t of tris) {
    const [a, b, c] = t.map(project);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    // Lens faces outwards: along -dirZ.
    if (n.z * -dirZ >= 0) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    else out.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  }
  centre.multiplyScalar(1 / Math.max(1, cache.size));
}

const mirror = (o: Outline): Outline => o.map(([x, y]) => [-x, y] as const);

function lightMesh(elements: Outline[], probe: BodyProbe, dirZ: number, levels: number, mats: THREE.Material[], name: string): { mesh: THREE.Mesh; centres: THREE.Vector3[] } {
  const pos: number[] = [];
  const centres: THREE.Vector3[] = [];
  const g = new THREE.BufferGeometry();
  [1, -1].forEach((side, s) => {
    const start = pos.length / 3;
    const centre = new THREE.Vector3();
    for (const e of elements) {
      const c = new THREE.Vector3();
      lens(side > 0 ? e : mirror(e), probe, dirZ, levels, pos, c);
      centre.add(c);
    }
    centres.push(centre.multiplyScalar(1 / elements.length));
    if (mats.length > 1) g.addGroup(start, pos.length / 3 - start, s);
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mats.length > 1 ? mats : mats[0]);
  mesh.name = name;
  return { mesh, centres };
}

/** `face`: the fascia mesh, when the nose face is cut out of the grid. */
export function buildLights(grid: BodyGrid, p: BodyProfile, head: THREE.Material, tail: THREE.Material, high: boolean, face: THREE.BufferGeometry | null): LightSet {
  const levels = high ? 2 : 0;
  const front = face ? makeProbe(grid, grid.rowAt.noseStart - 10, grid.rowAt.noseFace, [face]) : makeProbe(grid, grid.rowAt.noseStart - 10, grid.rows - 1);
  const rear = makeProbe(grid, 0, grid.rowAt.tailStart + 10);
  const headEls = [p.headlight.outline, ...(p.headlight.bars ?? [])];
  const tailEls = p.taillight.bars?.length ? p.taillight.bars : [p.taillight.outline];
  const mats = (m: THREE.Material) => (high ? [m, m] : [m]);
  const h = lightMesh(headEls, front, -1, levels, mats(head), 'headlights');
  const t = lightMesh(tailEls, rear, 1, levels, mats(tail), 'taillights');
  front.dispose();
  rear.dispose();
  return { head: h.mesh, tail: t.mesh, headCentres: h.centres, tailCentres: t.centres };
}
