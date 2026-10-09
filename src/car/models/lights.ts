// Head and tail lights: 2D outlines from the profile, triangulated, subdivided
// and projected onto the lofted nose/tail so the lenses follow the surface.
// Each lamp is a dark housing (merged into the trim mesh by the caller) with
// emissive cores standing proud of it: projector lenses and DRL bars at the
// front, LED strips (or whole cells on a classic car) at the rear, plus the
// rain light under the tail.
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import { makeProbe, type BodyProbe } from '@/car/models/body-probe';
import { inset, ledCore } from '@/car/models/light-shapes';
import type { BodyProfile, Outline } from '@/car/models/profile-types';

export interface LightHousing { geometry: THREE.BufferGeometry; colour: number }

export interface LightSet {
  head: THREE.Mesh;
  tail: THREE.Mesh;
  /** Amber tail-lamp sections (profiles with taillight.amber only). */
  amber: THREE.Mesh | null;
  /** Dark lamp housings (head, tail) for the trim mesh. */
  housings: LightHousing[];
  /** Centres of [left, right] lights (model frame). */
  headCentres: THREE.Vector3[];
  tailCentres: THREE.Vector3[];
}

/** An outline and how far it stands off the body surface (m). */
interface Element { outline: Outline; proud: number }

const HOUSING_HEAD = 0x0b0c0f;
const HOUSING_LED_TAIL = 0x3c0609;
const HOUSING_CLASSIC_TAIL = 0x0a0a0b;

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

/** Projects one outline onto the body along z and appends a lens (positions only). */
function lens(e: Element, probe: BodyProbe, dirZ: number, levels: number, out: number[], centre: THREE.Vector3): void {
  const contour = resample(e.outline, 0.06);
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const tris = subdivide(faces.map(([i, j, k]) => [contour[i], contour[j], contour[k]] as Tri), levels);
  const cache = new Map<string, THREE.Vector3>();
  let lastZ = dirZ < 0 ? 2.3 : -2.5;
  const project = (v: THREE.Vector2) => {
    const key = `${v.x.toFixed(5)},${v.y.toFixed(5)}`;
    let p = cache.get(key);
    if (!p) {
      const hit = probe.cast(new THREE.Vector3(v.x, v.y, -dirZ * 6), new THREE.Vector3(0, 0, dirZ));
      p = hit ? hit.point.addScaledVector(hit.normal, e.proud) : new THREE.Vector3(v.x, v.y, lastZ);
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

/** Both sides of a lamp set as one geometry: group 0 = left, group 1 = right (when `grouped`). `extra` appends to the left group. */
function projectSides(elements: Element[], probe: BodyProbe, dirZ: number, levels: number, grouped: boolean, extra?: (pos: number[]) => void): { geometry: THREE.BufferGeometry; centres: THREE.Vector3[] } {
  const pos: number[] = [];
  const centres: THREE.Vector3[] = [];
  const g = new THREE.BufferGeometry();
  [1, -1].forEach((side, s) => {
    const start = pos.length / 3;
    const centre = new THREE.Vector3();
    for (const e of elements) {
      const c = new THREE.Vector3();
      lens(side > 0 ? e : { ...e, outline: mirror(e.outline) }, probe, dirZ, levels, pos, c);
      centre.add(c);
    }
    centres.push(centre.multiplyScalar(1 / elements.length));
    if (side > 0 && extra) extra(pos);
    if (grouped) g.addGroup(start, pos.length / 3 - start, s);
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return { geometry: g, centres };
}

/** Rain light: a small LED block on the rear centre, under the bumper, in the tail's left group. */
function rainLight(probe: BodyProbe, pos: number[]): void {
  const hit = probe.cast(new THREE.Vector3(0, 0.34, -6), new THREE.Vector3(0, 0, 1));
  if (!hit) return;
  const c = hit.point.addScaledVector(hit.normal, 0.012);
  const box = new THREE.BoxGeometry(0.11, 0.035, 0.024).translate(c.x, c.y, c.z);
  const p = box.toNonIndexed().getAttribute('position');
  for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
}

/** `face`: the fascia mesh, when the nose face is cut out of the grid. `amber`: material of the amber tail sections. */
export function buildLights(grid: BodyGrid, p: BodyProfile, head: THREE.Material, tail: THREE.Material, high: boolean, face: THREE.BufferGeometry | null, amber: THREE.Material | null = null): LightSet {
  const levels = high ? 2 : 0;
  const front = face ? makeProbe(grid, grid.rowAt.noseStart - 10, grid.rowAt.noseFace, [face]) : makeProbe(grid, grid.rowAt.noseStart - 10, grid.rows - 1);
  const rear = makeProbe(grid, 0, grid.rowAt.tailStart + 10);
  const classic = p.cockpit === 'classic';
  // Front: the housing is the lamp outline; a projector lens sits inside it, DRL bars stand a little prouder.
  const headEls: Element[] = [{ outline: inset(p.headlight.outline, 0.72), proud: 0.009 }, ...(p.headlight.bars ?? []).map((outline) => ({ outline, proud: 0.011 }))];
  // Amber sections get their own mesh at detail 'high'; far away (detail 'low', one draw call less) they join the tail lens.
  const amberEls = p.taillight.amber?.length && amber && high ? p.taillight.amber : null;
  const tailCells = p.taillight.bars?.length ? p.taillight.bars : [p.taillight.outline];
  const tailEls: Element[] = [
    ...tailCells.map((outline) => ({ outline: classic ? outline : ledCore(outline), proud: 0.009 })),
    ...(amberEls ? [] : p.taillight.amber ?? []).map((outline) => ({ outline, proud: 0.009 })),
  ];
  const housing = (outline: Outline, probe: BodyProbe, dirZ: number, colour: number): LightHousing => ({ geometry: projectSides([{ outline, proud: 0.003 }], probe, dirZ, Math.min(levels, 1), false).geometry, colour });
  const housings = [housing(p.headlight.outline, front, -1, HOUSING_HEAD), housing(p.taillight.outline, rear, 1, classic ? HOUSING_CLASSIC_TAIL : HOUSING_LED_TAIL)];
  const h = projectSides(headEls, front, -1, levels, high);
  const t = projectSides(tailEls, rear, 1, levels, high, high && !classic ? (pos) => rainLight(rear, pos) : undefined);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const out = new THREE.Mesh(g, high ? [m, m] : m);
    out.name = name;
    return out;
  };
  const a = amberEls && amber ? projectSides(amberEls.map((outline) => ({ outline, proud: 0.009 })), rear, 1, levels, false).geometry : null;
  front.dispose();
  rear.dispose();
  const amberMesh = a && amber ? new THREE.Mesh(a, amber) : null;
  if (amberMesh) amberMesh.name = 'tail-amber';
  return { head: mesh(h.geometry, head, 'headlights'), tail: mesh(t.geometry, tail, 'taillights'), amber: amberMesh, housings, headCentres: h.centres, tailCentres: t.centres };
}
