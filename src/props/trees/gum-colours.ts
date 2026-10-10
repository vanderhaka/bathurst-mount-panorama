import * as THREE from 'three';
import type { FaceInfo } from '@/props/core/mesher';
import type { Rng } from '@/props/core/rng';
import { GUM_SHADING, type TreeLook } from '@/props/look';

// Colour functions for gum trees: pale smooth bark (mottled, with hanging ribbons at
// the base) or rough grey-brown box bark, silver dead wood, and grey-green crowns
// shaded by height and depth inside the crown mass.

/** Base crown colour for one tree: a blend of two neighbouring look colours plus per-tree jitter. */
export function foliageBase(look: TreeLook, hue: number, rng: Rng, shade = 1): THREE.Color {
  const n = look.foliage.length;
  const h = ((hue % n) + n) % n;
  const i = Math.floor(h);
  const c = new THREE.Color().setHex(look.foliage[i]).lerp(new THREE.Color().setHex(look.foliage[Math.min(n - 1, i + 1)]), h - i);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Per-tree variation of about +-8 % in saturation and value so neighbours differ.
  const { hueJitter, satJitter, lightJitter } = GUM_SHADING;
  c.setHSL(hsl.h + rng.jitter(hueJitter), hsl.s * (1 + rng.jitter(satJitter)), Math.min(0.5, hsl.l * shade * (1 + rng.jitter(lightJitter))));
  return c;
}

export type BarkKind = 'smooth' | 'box' | 'dead';

/** Trunk/limb colour by face position. Smooth gums get bark ribbons below `strips` (m). */
export function barkColour(look: TreeLook, rng: Rng, kind: BarkKind, strips = 0): (f: FaceInfo) => THREE.Color {
  const smooth = new THREE.Color().setHex(look.trunk);
  const bark = new THREE.Color().setHex(look.bark);
  const strip = new THREE.Color().setHex(look.barkStrip);
  const box = new THREE.Color().setHex(look.boxBark);
  const dead = new THREE.Color().setHex(look.deadWood);
  const mottle = smooth.clone().lerp(bark, 0.22);
  const phase = rng() * 10;
  return (f) => {
    const p = f.centroid;
    const sun = 0.93 + 0.1 * Math.max(0, -f.normal.x * 0.5 - f.normal.z * 0.5);
    if (kind === 'dead') return dead.clone().multiplyScalar((0.9 + 0.1 * Math.sin(p.y * 3.1 + p.x * 5 + phase)) * sun);
    if (kind === 'box') {
      // Fibrous: vertical streaks of lighter and darker grey-brown.
      const around = Math.atan2(p.z, p.x);
      const streak = Math.sin(around * 5 + phase + p.y * 0.25) * 0.5 + Math.sin(p.y * 1.7 + around * 2) * 0.3;
      return box.clone().multiplyScalar((0.9 + 0.12 * streak) * sun);
    }
    if (p.y < strips) {
      const around = Math.atan2(p.z, p.x);
      const ribbon = Math.sin(around * 3 + phase + p.y * 0.35) > 0.15 + 0.7 * (p.y / strips);
      if (ribbon) return strip.clone().lerp(bark, 0.3 * Math.sin(p.y * 4 + phase) ** 2).multiplyScalar(sun);
    }
    const n = Math.sin(p.y * 2.1 + phase) * Math.sin(p.x * 2.9 + p.z * 2.3 + phase * 1.7) + 0.6 * Math.sin(p.y * 4.7 + p.x * 3.9 + phase);
    const c = n > 1.3 - look.barkPatchiness * 2.4 ? mottle.clone() : smooth.clone().multiplyScalar(0.97 + 0.05 * Math.sin(n * 3));
    return c.multiplyScalar(sun);
  };
}

/**
 * Crown face colour: silvery tops, cool slightly darker undersides, and faces deep
 * inside the crown mass darker still (light does not reach in).
 */
export function crownColour(look: TreeLook, base: THREE.Color, centre: THREE.Vector3, radii: THREE.Vector3): (f: FaceInfo) => THREE.Color {
  const sheen = new THREE.Color().setHex(look.sheen);
  const under = new THREE.Color().setHex(look.under);
  const d = new THREE.Vector3();
  return (f) => {
    const c = base.clone();
    const ny = f.normal.y;
    if (ny < -0.15) c.lerp(under, look.underBlend).multiplyScalar(1 - look.underShade * Math.min(1, -ny * 1.1));
    else if (ny > 0.3) c.lerp(sheen, look.topSheen * ny).multiplyScalar(1 + 0.05 * ny);
    d.copy(f.centroid).sub(centre).divide(radii);
    const depth = Math.min(1, d.length());
    return c.multiplyScalar(1 - look.innerShade * (1 - depth) * (1 - depth));
  };
}

/** Per-cluster colour drift so the crown is not one flat tone. */
export function clumpTint(base: THREE.Color, rng: Rng, amount: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h + rng.jitter(0.012), hsl.s * (1 + rng.jitter(amount)), hsl.l * (1 + rng.jitter(amount * 0.7)));
}
