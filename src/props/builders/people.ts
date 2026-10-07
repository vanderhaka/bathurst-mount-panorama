import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { box, loftRings, quad, strut } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';
import { addFigure, addFigureLod, type Joints, type Outfit } from '@/props/builders/figure';

// Spectators: standing poses and seated (camp chair, esky, on the grass).
// Shirt = instance colour. Pants, skin, hair and hats vary per variant.

export const PEOPLE_VARIANTS = { spectator: 8, spectatorSeated: 6 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Pair = [THREE.Vector3, THREE.Vector3];
const pair = (x: number, y: number, z: number): Pair => [V(-x, y, z), V(x, y, z)];

function standing(): Joints {
  return {
    pelvis: V(0, 0.93, 0),
    neck: V(0, 1.5, -0.01),
    knees: pair(0.1, 0.5, 0.03),
    ankles: pair(0.1, 0.09, -0.02),
    toes: pair(0.11, 0.03, 0.17),
    elbows: pair(0.24, 1.13, -0.04),
    wrists: pair(0.26, 0.88, 0.0),
    hands: pair(0.26, 0.79, 0.02),
  };
}

type ArmPose = (j: Joints) => void;
const POSES: ArmPose[] = [
  () => {},
  (j) => {
    // Can of drink at the chest (right hand).
    j.elbows[1] = V(0.22, 1.12, 0.06);
    j.wrists[1] = V(0.16, 1.28, 0.22);
    j.hands[1] = V(0.13, 1.35, 0.22);
  },
  (j) => {
    // Waving.
    j.elbows[1] = V(0.36, 1.6, 0.0);
    j.wrists[1] = V(0.38, 1.88, 0.05);
    j.hands[1] = V(0.38, 1.97, 0.06);
  },
  (j) => {
    // Hands on hips.
    j.elbows = pair(0.36, 1.12, -0.05);
    j.wrists = pair(0.21, 0.98, 0.0);
    j.hands = pair(0.17, 0.95, 0.04);
  },
  (j) => {
    // Hands in pockets, weight on one leg.
    j.pelvis.x = 0.03;
    j.knees[0] = V(-0.11, 0.5, 0.09);
    j.ankles[0] = V(-0.16, 0.09, 0.02);
    j.toes[0] = V(-0.2, 0.03, 0.2);
    j.elbows = pair(0.24, 1.14, -0.05);
    j.wrists = pair(0.2, 0.95, 0.02);
    j.hands = pair(0.16, 0.92, 0.06);
  },
  (j) => {
    // Both arms up, cheering.
    j.elbows = pair(0.33, 1.65, 0.02);
    j.wrists = pair(0.3, 1.92, 0.05);
    j.hands = pair(0.29, 2.0, 0.05);
  },
  (j) => {
    // Filming with a phone.
    j.elbows = pair(0.2, 1.2, 0.18);
    j.wrists = pair(0.07, 1.42, 0.3);
    j.hands = pair(0.04, 1.47, 0.32);
  },
  (j) => {
    // Arms folded loosely in front.
    j.elbows = pair(0.25, 1.1, 0.06);
    j.wrists = pair(0.08, 1.18, 0.17);
    j.hands = pair(-0.05, 1.2, 0.15);
  },
];

function outfit(variant: number): Outfit {
  const p = PROPS_LOOK.people;
  const hatKinds: Array<Outfit['hat']> = [undefined, { kind: 'cap', colour: p.hats[0] }, undefined, { kind: 'wide', colour: p.hats[3] }, { kind: 'cap', colour: p.hats[1] }, undefined, { kind: 'cap', colour: p.hats[2] }, undefined];
  return {
    skin: p.skin[variant % p.skin.length],
    hair: p.hair[(variant * 3) % p.hair.length],
    pants: p.pants[(variant * 2) % p.pants.length],
    shoes: [BUILDING.darkGrey, BUILDING.white, TRACKSIDE.tyre][variant % 3],
    sleeves: variant % 4 === 2 ? 'long' : 'short',
    legs: variant % 3 === 1 ? 'shorts' : 'long',
    hat: hatKinds[variant % hatKinds.length],
    girth: [1, 1.12, 0.92, 1.22, 1.0, 0.95, 1.05, 1.15][variant % 8],
  };
}

const SCALE = [1.0, 1.04, 0.95, 1.02, 0.98, 1.06, 0.93, 1.01];

function finish(m: Mesher, lod: Mesher, scale: number): BuiltProp {
  const g = m.build().scale(scale, scale, scale);
  const l = lod.build().scale(scale, scale, scale);
  g.computeBoundingBox();
  return { geometry: g, lod: l, radius: 0.35, height: (g.boundingBox?.max.y ?? 1.8) };
}

export function buildSpectator(variant: number): BuiltProp {
  const j = standing();
  POSES[variant % POSES.length](j);
  const o = outfit(variant);
  const m = new Mesher(true);
  addFigure(m, j, o);
  const lod = new Mesher(true);
  addFigureLod(lod, j, o);
  return finish(m, lod, SCALE[variant % SCALE.length]);
}

/** Folding camp chair: sagging seat and back fabric, armrests, splayed legs. Front = +Z. */
function addCampChair(m: Mesher, fabric: number): void {
  const frame = BUILDING.darkGrey;
  // Seat sags in the middle; rings run back→front so the top faces up.
  const rings = [-0.27, 0, 0.27].map((x) => {
    const y = x === 0 ? 0.37 : 0.42;
    return [V(x, y + 0.01, -0.2), V(x, y, -0.2), V(x, y, x === 0 ? 0.22 : 0.24)];
  });
  m.add(loftRings(rings, { closed: false }), fabric);
  m.add(loftRings([...rings].reverse(), { closed: false }), new THREE.Color().setHex(fabric).multiplyScalar(0.7));
  m.add(quad(V(-0.27, 0.42, -0.2), V(0.27, 0.42, -0.2), V(0.27, 1.0, -0.36), V(-0.27, 1.0, -0.36), true), fabric);
  for (const s of [-1, 1]) {
    m.add(box(0.06, 0.035, 0.52, s * 0.31, 0.64, 0.0), frame);
    m.add(strut(V(s * 0.3, 0.64, 0.24), V(s * 0.33, 0, 0.3), 0.014, 3), frame);
    m.add(strut(V(s * 0.3, 0.64, -0.22), V(s * 0.33, 0, -0.3), 0.014, 3), frame);
    m.add(strut(V(s * 0.3, 0.42, -0.2), V(s * 0.28, 1.0, -0.36), 0.014, 3), frame);
  }
  m.add(strut(V(-0.31, 0.02, 0.3), V(0.31, 0.42, 0.24), 0.012, 3), frame);
  m.add(strut(V(0.31, 0.02, 0.3), V(-0.31, 0.42, 0.24), 0.012, 3), frame);
}

export function buildSpectatorSeated(variant: number): BuiltProp {
  const look = PROPS_LOOK;
  const o = outfit(variant + 3);
  const m = new Mesher(true);
  let j: Joints;
  if (variant <= 3) {
    j = {
      pelvis: V(0, 0.5, -0.05),
      neck: V(0, 1.04, -0.15),
      knees: pair(0.11, 0.52, 0.36),
      ankles: pair(0.13, 0.09, 0.42),
      toes: pair(0.14, 0.03, 0.58),
      elbows: pair(0.3, 0.7, -0.08),
      wrists: pair(0.31, 0.68, 0.17),
      hands: pair(0.3, 0.67, 0.26),
    };
    if (variant === 1) {
      j.elbows[1] = V(0.27, 0.7, -0.04);
      j.wrists[1] = V(0.2, 0.88, 0.13);
      j.hands[1] = V(0.17, 0.95, 0.14);
    } else if (variant === 2) {
      // Leaning forward, elbows on knees.
      j.neck = V(0, 1.0, 0.12);
      j.elbows = pair(0.15, 0.62, 0.3);
      j.wrists = pair(0.08, 0.74, 0.42);
      j.hands = pair(0.05, 0.78, 0.44);
    }
    addCampChair(m, look.camping.chairs[variant % look.camping.chairs.length]);
  } else if (variant === 4) {
    // Sitting on an esky.
    j = {
      pelvis: V(0, 0.47, -0.02),
      neck: V(0, 1.02, -0.06),
      knees: pair(0.13, 0.48, 0.34),
      ankles: pair(0.15, 0.09, 0.4),
      toes: pair(0.17, 0.03, 0.56),
      elbows: pair(0.24, 0.72, 0.05),
      wrists: pair(0.17, 0.56, 0.3),
      hands: pair(0.14, 0.52, 0.36),
    };
    m.add(box(0.62, 0.32, 0.4, 0, 0.16, -0.03), look.camping.esky);
    m.add(box(0.64, 0.07, 0.42, 0, 0.355, -0.03), BUILDING.accentBlue);
  } else {
    // On the grass, leaning back on the hands, knees up, on a rug.
    j = {
      pelvis: V(0, 0.13, -0.1),
      neck: V(0, 0.67, -0.32),
      knees: pair(0.12, 0.38, 0.22),
      ankles: pair(0.14, 0.08, 0.48),
      toes: pair(0.15, 0.1, 0.62),
      elbows: pair(0.23, 0.38, -0.38),
      wrists: pair(0.25, 0.12, -0.48),
      hands: pair(0.25, 0.03, -0.52),
    };
    m.add(box(1.5, 0.02, 1.2, 0, 0.01, 0), look.camping.tentFly[variant % look.camping.tentFly.length]);
  }
  addFigure(m, j, o);
  const lod = new Mesher(true);
  addFigureLod(lod, j, o);
  return { ...finish(m, lod, 1), radius: variant === 5 ? 0.8 : 0.45 };
}
