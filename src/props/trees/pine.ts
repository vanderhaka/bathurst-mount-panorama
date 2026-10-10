import * as THREE from 'three';
import { Mesher, type FaceInfo } from '@/props/core/mesher';
import { createRng, lerp } from '@/props/core/rng';
import { loftRings, tube } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';

// Radiata pine: a bowed trunk and irregular, offset, tilted drooping tiers (darker below).

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
    const rr = r * tip * (0.78 + rng() * 0.44);
    out.push(new THREE.Vector3(Math.cos(a) * rr, y - droop * tip * (0.7 + rng() * 0.6), -Math.sin(a) * rr));
  }
  return out;
}

/** One tier: a drooping skirt (top point → star rim) closed by a shallow underside. */
function tier(yTop: number, yRim: number, rRim: number, sides: number, phase: number, rng: () => number): THREE.BufferGeometry {
  const droop = (yTop - yRim) * 0.3;
  const top = ring(yTop, rRim * 0.2, sides, phase, 0, 0, rng);
  const mid = ring(lerp(yTop, yRim, 0.55), rRim * 0.72, sides, phase, 0.3, droop * 0.3, rng);
  const rim = ring(yRim, rRim, sides, phase, 0.45, droop, rng);
  const under = ring(yRim + (yTop - yRim) * 0.22, rRim * 0.22, sides, phase, 0, 0, rng);
  // Rings run bottom-up so faces point outwards (loftRings winding).
  return loftRings([under, rim, mid, top], { capStart: true, capEnd: true });
}

export function buildPine(variant: number): PineResult {
  const look = PROPS_LOOK.pine;
  const rng = createRng(variant * 131 + 7);
  const H = lerp(look.height[0], look.height[1], [0.55, 0.85, 0.3, 1, 0.7][variant % 5]);
  const tiers = Math.round(lerp(look.tiers[0], look.tiers[1], rng()));
  const bare = H * lerp(0.28, 0.4, rng());
  const rMax = H * lerp(0.2, 0.27, rng());
  const near = new Mesher();
  const far = new Mesher();
  const trunk = new THREE.Color().setHex(look.trunk);
  const r0 = H * 0.026;
  // Slightly bowed trunk that carries on through the crown as a thin leader.
  const lean = new THREE.Vector3(rng.jitter(H * 0.02), 0, rng.jitter(H * 0.02));
  const bowed = [new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, bare, 0).addScaledVector(lean, 0.5), new THREE.Vector3(0, H * 0.93, 0).add(lean)];
  near.add(tube(bowed, [r0 * 1.4, r0 * 0.9, r0 * 0.2], 5), trunk, { jitter: 0.08 });
  far.add(tube([bowed[0], new THREE.Vector3(0, bare + 0.5, 0)], [r0 * 1.4, r0 * 0.9], 3), trunk);
  const dark = new THREE.Color().setHex(look.foliageDark);
  const mid = new THREE.Color().setHex(look.foliage);
  const colour = (f: FaceInfo) => {
    const t = THREE.MathUtils.clamp((f.centroid.y - bare) / (H - bare), 0, 1);
    const c = dark.clone().lerp(mid, 0.05 + 0.4 * t);
    if (f.normal.y < 0) c.multiplyScalar(0.55);
    else c.multiplyScalar(0.72 + 0.2 * f.normal.y);
    return c;
  };
  const span = H - bare;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    // Uneven spacing and radius: some tiers poke out, others are thin, so the crown is ragged not conical.
    const yRim = bare + span * (t + rng.jitter(0.035)) * 0.94;
    const yTop = Math.min(H, yRim + span * (0.22 - 0.06 * t) * (0.8 + rng() * 0.5));
    const r = rMax * Math.pow(1 - t, 0.55) * (0.55 + rng() * 0.7) + 0.3;
    const geo = tier(yTop, yRim, r, rng() < 0.5 ? 7 : 8, rng() * Math.PI, rng);
    // Tilt about the tier's own base, then shift it off the trunk axis.
    geo.translate(0, -yRim, 0); geo.rotateZ(rng.jitter(0.09)); geo.rotateX(rng.jitter(0.09)); geo.translate(rng.jitter(r * 0.2), yRim, rng.jitter(r * 0.2));
    near.add(geo, colour, { jitter: look.faceJitter });
  }
  // Far LOD: four uneven cones that follow the same ragged silhouette.
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const yRim = bare + span * t * 0.9;
    const yTop = Math.min(H, yRim + span * 0.36);
    const r = rMax * Math.pow(1 - t, 0.7) * (0.7 + 0.1 * ((i * 5) % 4)) + 0.3;
    const cone = loftRings([ring(yRim, r, 6, i, 0.3, 0.2, () => 0.5), ring(yTop, 0, 6, i, 0, 0, () => 0.5)], { capStart: true });
    far.add(cone, colour);
  }
  return { near: near.build(), far: far.build(), height: H, radius: rMax };
}
