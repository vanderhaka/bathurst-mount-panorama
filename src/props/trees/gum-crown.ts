import * as THREE from 'three';
import type { Rng } from '@/props/core/rng';
import { blob } from '@/props/core/shapes';

// Gum crown: one connected, rounded-oval mass made of lumpy clusters packed around
// an envelope ellipsoid. Clusters overlap heavily, so the crown reads as one canopy
// with a ragged edge and only small gaps at the rim (neither one smooth ball nor
// separate pads on bare branches).

export interface Cluster {
  centre: THREE.Vector3;
  size: THREE.Vector3;
}

export interface CrownShape {
  centre: THREE.Vector3;
  /** Envelope half-sizes (x, y, z). */
  radii: THREE.Vector3;
}

/** Triangles per near cluster (displaced icosahedron, detail 0). */
export const CLUSTER_TRIS = 20;

/**
 * Packs `count` clusters around the envelope: one core cluster, the rest on a
 * golden-angle spiral over the upper three-quarters of the ellipsoid at `reach`
 * of its radius, sized `size` of its radius (so their outer faces poke past the
 * envelope and make the silhouette ragged).
 */
export function planClusters(shape: CrownShape, count: number, size: [number, number], reach: [number, number], rng: Rng): Cluster[] {
  const { centre, radii } = shape;
  const out: Cluster[] = [];
  if (count <= 0) return out;
  out.push({ centre: centre.clone().add(new THREE.Vector3(0, radii.y * 0.05, 0)), size: radii.clone().multiplyScalar(0.62) });
  const n = count - 1;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    // y from -0.55 (lower rim) to 0.9 (crown top), evenly in area.
    const y = 0.9 - (1.45 * (i + 0.5)) / n;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = phase + i * golden;
    const dir = new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    const k = reach[0] + (reach[1] - reach[0]) * rng();
    const c = centre.clone().add(dir.multiply(radii).multiplyScalar(k));
    const s = size[0] + (size[1] - size[0]) * rng();
    // Lower clusters are flatter (foliage hangs in layers under the crown).
    const flat = y < -0.2 ? 0.7 : 0.85;
    out.push({ centre: c, size: new THREE.Vector3(radii.x * s, radii.y * s * flat, radii.z * s) });
  }
  return out;
}

/** Near cluster geometry: a lumpy icosahedron, flattened below. */
export function clusterGeometry(c: Cluster, rng: Rng): THREE.BufferGeometry {
  const g = blob(c.size, 0, rng, 0.24, 0.8);
  g.rotateY(rng() * Math.PI);
  g.translate(c.centre.x, c.centre.y, c.centre.z);
  return g;
}

/**
 * Far crown (≤ 48 tris): two overlapping lumpy lobes laid along the crown's long
 * axis (side by side for wide crowns, stacked for tall ones) and one small
 * octahedral lump on the rim, so the silhouette stays a ragged oval.
 */
export function farCrownGeometry(shape: CrownShape, rng: Rng): THREE.BufferGeometry[] {
  const { centre, radii } = shape;
  const wide = radii.x >= radii.y;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const off = wide ? new THREE.Vector3(s * radii.x * 0.38, rng.jitter(radii.y * 0.08), rng.jitter(radii.z * 0.15)) : new THREE.Vector3(s * radii.x * 0.18, s * radii.y * 0.24, rng.jitter(radii.z * 0.12));
    const size = wide ? new THREE.Vector3(radii.x * 0.64, radii.y * 0.9, radii.z * 0.88) : new THREE.Vector3(radii.x * 0.9, radii.y * 0.78, radii.z * 0.9);
    const g = blob(size, 0, rng, 0.24, 0.8);
    g.rotateY(rng() * Math.PI);
    g.translate(centre.x + off.x, centre.y + off.y, centre.z + off.z);
    parts.push(g);
  }
  const a = rng() * Math.PI * 2;
  const lump = new THREE.OctahedronGeometry(1, 0).scale(radii.x * 0.42, radii.y * 0.4, radii.z * 0.42);
  lump.deleteAttribute('normal');
  lump.deleteAttribute('uv');
  lump.translate(centre.x + Math.cos(a) * radii.x * 0.62, centre.y + radii.y * 0.25, centre.z + Math.sin(a) * radii.z * 0.62);
  parts.push(lump);
  return parts;
}
