import * as THREE from 'three';
import { Mesher, type FaceInfo } from '@/props/core/mesher';
import { createRng, lerp, type Rng } from '@/props/core/rng';
import { tube } from '@/props/core/shapes';
import type { TreeLook } from '@/props/look';
import { barkColour, clumpTint, crownColour, foliageBase } from '@/props/trees/gum-colours';
import { CLUSTER_TRIS, clusterGeometry, farCrownGeometry, planClusters, type CrownShape } from '@/props/trees/gum-crown';

// Eucalyptus ("gum") builder. A short bare trunk forks low (25–40 % of the height)
// into 2–4 thick limbs that disappear into one connected, rounded-oval crown of
// lumpy clusters. Smooth gums have pale white-grey bark and a slightly more open
// crown; box gums have rough grey-brown bark and denser, rounder, darker crowns.

export interface GumStyle {
  /** 0..1 position inside the look's height range. */
  size: number;
  /** Fork height as a fraction of tree height (0.25–0.4). */
  fork: number;
  /** Trunk lean (rad) and its direction. */
  lean: number;
  leanDir: number;
  /** Main limbs from the fork (2–4) and stems from the ground. */
  limbs: number;
  stems: number;
  /** Position in look.foliage (fractions blend with the next colour). */
  hue: number;
  bark: 'smooth' | 'box';
  /** Smooth gums: hanging bark ribbons up to this fraction of the fork height. */
  strips: number;
  /** Crown half-width as a fraction of the height, and crown bottom height (fraction of the height). */
  crownW: number;
  crownBase: number;
  /** Crown shifted towards the lean side by this fraction of its half-width. */
  asym: number;
  /** Clusters in the crown (5–9 for mature trees). */
  clusters: number;
  /** Limbs that stay visible under the crown edge before entering it (0–2). */
  showLimbs: number;
  /** 'limb': one bare dead branch above the crown. 'stag': a dying tree, dead limbs over a low live crown. */
  dead?: 'limb' | 'stag';
}

export interface GumResult {
  near: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  height: number;
  radius: number;
}

type Paint = (f: FaceInfo) => THREE.Color;

const UP = new THREE.Vector3(0, 1, 0);
const NEAR_BUDGET = 450;
const FAR_BUDGET = 60;

function dirFrom(azimuth: number, fromVertical: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(fromVertical) * Math.cos(azimuth), Math.cos(fromVertical), Math.sin(fromVertical) * Math.sin(azimuth));
}

function bezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(b, t * t);
}

/** Trunk(s) from the ground to the fork. Returns the fork point of each stem. */
function buildStems(near: Mesher, style: GumStyle, forkY: number, r0: number, paint: Paint, rng: Rng): THREE.Vector3[] {
  const leanV = new THREE.Vector3(Math.cos(style.leanDir), 0, Math.sin(style.leanDir));
  const tops: THREE.Vector3[] = [];
  for (let s = 0; s < style.stems; s++) {
    const dir = style.stems > 1 ? (s / style.stems) * Math.PI * 2 + rng() : 0;
    const sideV = new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir));
    const splay = style.stems > 1 ? 0.12 + rng() * 0.1 : 0;
    const off = style.stems > 1 ? sideV.clone().multiplyScalar(r0 * 0.9) : new THREE.Vector3();
    const height = forkY * (style.stems > 1 ? 0.9 + rng() * 0.2 : 1);
    const path: THREE.Vector3[] = [];
    const radii: number[] = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      const y = height * t;
      const sway = new THREE.Vector3(rng.jitter(1), 0, rng.jitter(1)).multiplyScalar(t * (1 - t) * height * 0.06);
      path.push(new THREE.Vector3(0, y, 0).add(off).addScaledVector(leanV, Math.tan(style.lean) * y).addScaledVector(sideV, Math.tan(splay) * y).add(sway));
      radii.push(i === 0 ? r0 * 1.5 : r0 * lerp(1.05, 0.85, t));
    }
    path[0].y = -0.05;
    path.splice(1, 0, new THREE.Vector3(path[0].x, Math.min(0.6, height * 0.1), path[0].z));
    radii.splice(1, 0, r0 * 1.15);
    near.add(tube(path, radii, 6, { rng, roughness: 0.06, phase: rng() * 6 }), paint, { jitter: 0.04 });
    tops.push(path[path.length - 1]);
  }
  return tops;
}

/** Crown envelope for the style (shifted towards the lean, wider for paddock trees). */
function crownShape(style: GumStyle, H: number, tops: THREE.Vector3[]): CrownShape {
  const yb = H * style.crownBase;
  const ry = (H - yb) / 2;
  const rx = H * style.crownW;
  const top = tops.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / tops.length);
  const leanV = new THREE.Vector3(Math.cos(style.leanDir), 0, Math.sin(style.leanDir));
  const centre = new THREE.Vector3(top.x, yb + ry, top.z).addScaledVector(leanV, rx * style.asym);
  return { centre, radii: new THREE.Vector3(rx, ry, rx * 0.88) };
}

/** Thick limbs from the fork into the crown; the first `showLimbs` run out under the crown edge first. */
function buildLimbs(near: Mesher, style: GumStyle, shape: CrownShape, tops: THREE.Vector3[], r0: number, live: Paint, dead: Paint, rng: Rng): THREE.Vector3[] {
  const { centre, radii } = shape;
  const visibleEnds: THREE.Vector3[] = [];
  const sides = style.limbs >= 4 ? 4 : 5;
  for (let l = 0; l < style.limbs; l++) {
    const start = tops[l % tops.length].clone().addScaledVector(UP, -r0 * 0.8);
    const az = style.leanDir + (l / style.limbs) * Math.PI * 2 + rng.jitter(0.5);
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const visible = l < style.showLimbs;
    const stagDead = style.dead === 'stag' && l >= 1;
    let end: THREE.Vector3;
    if (stagDead) end = centre.clone().addScaledVector(out, radii.x * 0.5).addScaledVector(UP, radii.y * (1.15 + rng() * 0.3));
    else if (visible) end = centre.clone().addScaledVector(out.clone().multiply(radii), 0.82).addScaledVector(UP, -radii.y * 0.5);
    else end = centre.clone().addScaledVector(out.clone().multiply(radii), 0.32).addScaledVector(UP, rng.jitter(radii.y * 0.25));
    const ctrl = start.clone().lerp(end, 0.5).addScaledVector(UP, start.distanceTo(end) * (visible ? 0.28 : 0.12));
    const pts = [0, 0.34, 0.68, 1].map((t, i) => {
      const p = bezier(start, ctrl, end, t);
      return i === 0 || i === 3 ? p : p.add(new THREE.Vector3(rng.jitter(1), 0, rng.jitter(1)).multiplyScalar(start.distanceTo(end) * 0.04));
    });
    const rl = r0 * Math.min(0.85, 1.3 / Math.sqrt(style.limbs / style.stems));
    near.add(tube(pts, [rl, rl * 0.8, rl * 0.6, rl * (visible ? 0.35 : 0.45)], sides, { rng, roughness: 0.05, phase: rng() }), stagDead ? dead : live, { jitter: 0.04 });
    if (visible) visibleEnds.push(end);
    if (stagDead) {
      for (const side of [-1, 1]) {
        const d = dirFrom(az + side * 0.8, 0.5 + rng() * 0.3);
        near.add(tube([end, end.clone().addScaledVector(d, radii.y * (0.35 + rng() * 0.2))], [rl * 0.3, rl * 0.08], 3), dead);
      }
    }
  }
  if (style.dead === 'limb') {
    // A bare dead branch rising out of the crown top.
    const az = rng() * Math.PI * 2;
    const a = centre.clone().addScaledVector(UP, radii.y * 0.2);
    const b = centre.clone().add(new THREE.Vector3(Math.cos(az) * radii.x * 0.35, radii.y * 1.35, Math.sin(az) * radii.z * 0.35));
    const c = b.clone().add(new THREE.Vector3(Math.cos(az + 1) * radii.x * 0.25, radii.y * 0.2, Math.sin(az + 1) * radii.z * 0.25));
    near.add(tube([a, b, c], [r0 * 0.35, r0 * 0.18, r0 * 0.05], 4), dead, { jitter: 0.05 });
  }
  return visibleEnds;
}

/** Builds one gum tree (near + far geometry). */
export function buildGum(look: TreeLook, style: GumStyle, seed: number): GumResult {
  const rng = createRng(seed);
  const H = lerp(look.height[0], look.height[1], style.size);
  const near = new Mesher();
  const far = new Mesher();
  const box = style.bark === 'box';
  const forkY = H * style.fork;
  const r0 = H * (box ? 0.03 : 0.026) * (style.stems > 1 ? 0.7 : 1) * (0.9 + rng() * 0.2);
  const wood = barkColour(look, rng, box ? 'box' : 'smooth', forkY * style.strips);
  const dead = barkColour(look, rng, 'dead');
  const farWoodColour = new THREE.Color().setHex(box ? look.boxBark : look.trunk).multiplyScalar(0.92);
  const farWood: Paint = () => farWoodColour;
  const tops = buildStems(near, style, forkY, r0, wood, rng);

  let shape = crownShape(style, H, tops);
  if (style.dead === 'stag') {
    // Live epicormic foliage only in the lower part of the crown.
    shape = { centre: shape.centre.clone().addScaledVector(UP, -shape.radii.y * 0.45), radii: shape.radii.clone().multiply(new THREE.Vector3(0.7, 0.5, 0.7)) };
  }
  const visibleEnds = buildLimbs(near, style, shape, tops, r0, wood, dead, rng);

  // Crown clusters: as many as the budget allows, up to the variant's count.
  const room = Math.floor((NEAR_BUDGET - near.triangles) / CLUSTER_TRIS);
  const count = Math.max(2, Math.min(room, Math.round(Math.min(look.clusters[1], Math.max(style.dead === 'stag' ? 3 : look.clusters[0], style.clusters)))));
  const clusters = planClusters(shape, count - Math.min(visibleEnds.length, 2), look.clusterSize, look.clusterReach, rng);
  // Visible limbs end in a low hanging cluster at the crown edge.
  for (const e of visibleEnds.slice(0, 2)) clusters.push({ centre: e.clone().addScaledVector(UP, shape.radii.y * 0.12), size: shape.radii.clone().multiplyScalar(0.36).setY(shape.radii.y * 0.3) });
  // Small tufts poking out of the rim make the silhouette ragged (budget permitting).
  const tufts = Math.min(3, Math.floor((NEAR_BUDGET - near.triangles) / CLUSTER_TRIS) - clusters.length);
  for (let i = 0; i < tufts; i++) {
    const a = rng() * Math.PI * 2;
    const y = rng.range(-0.2, 0.55);
    const ring = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    clusters.push({ centre: shape.centre.clone().add(dir.multiply(shape.radii).multiplyScalar(0.92)), size: shape.radii.clone().multiplyScalar(0.26 + rng() * 0.08) });
  }
  const base = foliageBase(look, style.hue, rng, box ? look.boxCrownShade : 1);
  for (const c of clusters) near.add(clusterGeometry(c, rng), crownColour(look, clumpTint(base, rng, 0.1), shape.centre, shape.radii), { jitter: look.faceJitter });

  // Far version: trunk(s) up into the crown, dead wood as fins, then the oval crown in 2–3 lumps.
  for (const t of tops.slice(0, 2)) {
    const into = new THREE.Vector3(t.x, Math.max(t.y, shape.centre.y - shape.radii.y * 0.3), t.z).lerp(shape.centre.clone().setY(Math.max(t.y, shape.centre.y - shape.radii.y * 0.3)), 0.5);
    far.add(tube([new THREE.Vector3(t.x * 0.2, -0.05, t.z * 0.2), into], [r0 * 1.3, r0 * 0.7], 3), farWood);
  }
  if (style.dead) addDeadFins(far, style, shape, tops, r0, dead);
  const farParts = farCrownGeometry(shape, rng);
  const farColour = crownColour(look, base.clone().multiplyScalar(0.95), shape.centre, shape.radii);
  for (const g of farParts) {
    if (far.triangles + g.getAttribute('position').count / 3 > FAR_BUDGET) break;
    far.add(g, farColour);
  }

  // Scale so the tallest point lands exactly on the target height H.
  const g = near.build();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const k = H / bb.max.y;
  const radius = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * k;
  return { near: g.scale(k, k, k), far: far.build().scale(k, k, k), height: H, radius };
}

/** Far-version dead wood: thin double-sided tapers (2 tris each). */
function addDeadFins(far: Mesher, style: GumStyle, shape: CrownShape, tops: THREE.Vector3[], r0: number, dead: Paint): void {
  const n = style.dead === 'stag' ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const az = style.leanDir + (i / n) * Math.PI * 2 + 0.6;
    const from = style.dead === 'stag' ? tops[0] : shape.centre;
    const to = shape.centre.clone().add(new THREE.Vector3(Math.cos(az) * shape.radii.x * 0.6, shape.radii.y * (style.dead === 'stag' ? 2.6 : 1.4), Math.sin(az) * shape.radii.z * 0.6));
    const d = to.clone().sub(from).normalize();
    const side = new THREE.Vector3().crossVectors(d, UP).normalize().multiplyScalar(r0 * 0.5);
    const a = from.clone().add(side);
    const b = from.clone().sub(side);
    far.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([a, b, to, b, a, to].flatMap((v) => [v.x, v.y, v.z]), 3)), dead);
  }
}
