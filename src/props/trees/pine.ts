import * as THREE from 'three';
import { Mesher, type FaceInfo } from '@/props/core/mesher';
import { createRng, lerp } from '@/props/core/rng';
import { loftRings, tube } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';

// Layered conical pine: a straight tapering trunk and drooping, star-edged tiers.

export interface PineResult {
  near: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  height: number;
  radius: number;
}

function ring(y: number, r: number, sides: number, phase: number, star: number, droop: number, rng: () => number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = phase + (i / sides) * Math.PI * 2;
    const tip = i % 2 === 0 ? 1 : 1 - star;
    const rr = r * tip * (0.92 + rng() * 0.16);
    out.push(new THREE.Vector3(Math.cos(a) * rr, y - droop * tip * (0.7 + rng() * 0.6), -Math.sin(a) * rr));
  }
  return out;
}

/** One tier: a drooping skirt (top point → star rim) closed by a shallow underside. */
function tier(yTop: number, yRim: number, rRim: number, sides: number, phase: number, rng: () => number): THREE.BufferGeometry {
  const droop = (yTop - yRim) * 0.18;
  const top = ring(yTop, 0, sides, phase, 0, 0, rng);
  const mid = ring(lerp(yTop, yRim, 0.55), rRim * 0.62, sides, phase, 0.18, droop * 0.3, rng);
  const rim = ring(yRim, rRim, sides, phase, 0.3, droop, rng);
  const under = ring(yRim + (yTop - yRim) * 0.22, rRim * 0.22, sides, phase, 0, 0, rng);
  // Rings run bottom-up so faces point outwards (loftRings winding).
  return loftRings([under, rim, mid, top], { capStart: true });
}

export function buildPine(variant: number): PineResult {
  const look = PROPS_LOOK.pine;
  const rng = createRng(variant * 131 + 7);
  const H = lerp(look.height[0], look.height[1], [0.55, 0.85, 0.3, 1, 0.7][variant % 5]);
  const tiers = Math.round(lerp(look.tiers[0], look.tiers[1], rng()));
  const bare = H * lerp(0.18, 0.32, rng());
  const rMax = H * lerp(0.2, 0.27, rng());
  const near = new Mesher();
  const far = new Mesher();
  const trunk = new THREE.Color().setHex(look.trunk);
  const r0 = H * 0.022;
  near.add(tube([new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, bare, 0), new THREE.Vector3(0, H * 0.9, 0)], [r0 * 1.2, r0 * 0.8, r0 * 0.2], 5), trunk, { jitter: 0.06 });
  far.add(tube([new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, bare + 0.5, 0)], [r0 * 1.2, r0 * 0.8], 3), trunk);
  const dark = new THREE.Color().setHex(look.foliageDark);
  const mid = new THREE.Color().setHex(look.foliage);
  const colour = (f: FaceInfo) => {
    const t = THREE.MathUtils.clamp((f.centroid.y - bare) / (H - bare), 0, 1);
    const c = dark.clone().lerp(mid, 0.5 + 0.5 * t);
    if (f.normal.y < 0) c.multiplyScalar(0.62);
    else c.multiplyScalar(1.05 + 0.1 * f.normal.y);
    return c;
  };
  const span = H - bare;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const yRim = bare + span * t * 0.94;
    const yTop = Math.min(H, yRim + span * (0.32 - 0.1 * t));
    const r = rMax * Math.pow(1 - t, 0.85) * (0.9 + rng() * 0.2) + 0.3;
    near.add(tier(yTop, yRim, r, 8, rng() * Math.PI, rng), colour, { jitter: look.faceJitter });
  }
  // Far LOD: three plain cones.
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    const yRim = bare + span * t * 0.9;
    const yTop = Math.min(H, yRim + span * 0.45);
    const r = rMax * Math.pow(1 - t, 0.85) + 0.3;
    const cone = loftRings([ring(yRim, r, 6, i, 0.15, 0, () => 0.5), ring(yTop, 0, 6, i, 0, 0, () => 0.5)], { capStart: true });
    far.add(cone, colour);
  }
  return { near: near.build(), far: far.build(), height: H, radius: rMax };
}
