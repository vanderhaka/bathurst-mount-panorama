// Cabin (detail 'high' only), in three groups:
//  - cabin: always shown (liner, seat, driver, dash top, floor, bulkheads), so
//    the car never looks hollow from outside;
//  - outside: cheap roll cage and wheel rim, shown while the cockpit is hidden;
//  - group: the detailed cockpit for the cockpit and bonnet cameras (cage, wheel
//    with buttons, switch panel, MoTeC display).
import * as THREE from 'three';
import type { Livery } from '@/types/car-model';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, loft, merge, tint } from '@/car/models/geo-utils';
import { buildDriver } from '@/car/models/interior-driver';
import { buildCage, CAGE_DETAIL, CAGE_SIMPLE, tube } from '@/car/models/interior-cage';
import { CLASSIC_RIM_R, classicWheel, steeringWheel, switchPanel } from '@/car/models/interior-controls';
import { classicCockpit } from '@/car/models/interior-classic';
import { buildInteriorMirror, type InteriorMirror } from '@/car/models/interior-mirror';
import { displayCowl, mouldedDash, type Dash } from '@/car/models/interior-dash';

export interface Interior {
  /** Detailed cockpit: shown by setInteriorVisible(true). */
  group: THREE.Group;
  /** Simple cabin, always shown (except for the ghost). */
  cabin: THREE.Group;
  /** Cheap stand-ins for the detailed cage and wheel, shown while `group` is hidden. */
  outside: THREE.Group;
  steering: THREE.Group;
  mirror: InteriorMirror;
}

const X = new THREE.Vector3(1, 0, 0);
const CAGE = 0xc8ccd0;

function seat(eye: THREE.Vector3, colour: number): THREE.BufferGeometry {
  const hip = new THREE.Vector3(eye.x, 0.2, eye.z - 0.04);
  const path = [
    hip.clone().add(new THREE.Vector3(0, 0.08, 0.42)),
    hip.clone().add(new THREE.Vector3(0, 0.0, 0.18)),
    hip.clone().add(new THREE.Vector3(0, -0.02, -0.08)),
    hip.clone().add(new THREE.Vector3(0, 0.22, -0.2)),
    hip.clone().add(new THREE.Vector3(0, 0.55, -0.27)),
    new THREE.Vector3(eye.x, eye.y + 0.1, eye.z - 0.27),
  ];
  const u: Array<readonly [number, number]> = [[-0.25, 0.13], [-0.27, 0.0], [-0.23, -0.1], [0, -0.13], [0.23, -0.1], [0.27, 0.0], [0.25, 0.13]];
  const inner = u.map(([a, b]) => [a * 0.82, b * 0.72 - 0.02] as const).reverse();
  const poly = [...u, ...inner];
  const sections = path.map((c, i) => {
    const t = (i < path.length - 1 ? path[i + 1].clone().sub(c) : c.clone().sub(path[i - 1])).normalize();
    const n = new THREE.Vector3().crossVectors(X, t).normalize();
    const k = i >= 4 ? 1.1 : 1;
    return poly.map(([a, b]) => c.clone().addScaledVector(X, a * k).addScaledVector(n, b));
  });
  return tint(loft(sections, true, true), colour);
}

function bulkheads(p: BodyProfile, zHoop: number, dashTop: number): THREE.BufferGeometry {
  return merge([
    tint(extrude([[zHoop - 0.45, 0.1], [p.z.cowl + 0.15, 0.1], [p.z.cowl + 0.15, 0.118], [zHoop - 0.45, 0.118]], 1.5, (a, b, d) => [d - 0.75, b, a]), 0x232427),
    tint(extrude([[-0.75, 0.1], [0.75, 0.1], [0.72, dashTop - 0.2], [-0.72, dashTop - 0.2]], 0.02, (a, b, d) => [a, b, p.z.cowl + 0.13 + d]), 0x232427),
    tint(extrude([[-0.78, 0.1], [0.78, 0.1], [0.72, 1.0], [-0.72, 1.0]], 0.02, (a, b, d) => [a, b, zHoop - 0.45 + d]), 0x2a2b2e),
  ]);
}

/** Display bezel and screen on the dash, facing the driver. */
function display(d: Dash, eye: THREE.Vector3, mat: THREE.Material | null): { bezel: THREE.BufferGeometry; screen: THREE.Mesh | null } {
  const rot = new THREE.Euler(0.35, Math.PI, 0);
  const pos = new THREE.Vector3(eye.x, d.top + 0.045, d.rearZ + 0.04);
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(rot);
  const bezel = new THREE.BoxGeometry(0.235, 0.13, 0.02).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  bezel.translate(pos.x - normal.x * 0.0105, pos.y - normal.y * 0.0105, pos.z - normal.z * 0.0105);
  if (!mat) return { bezel: tint(bezel, 0x16171a), screen: null };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), mat);
  screen.name = 'motec-display';
  screen.position.copy(pos);
  screen.rotation.copy(rot);
  return { bezel: tint(bezel, 0x16171a), screen };
}

function named(name: string, g: THREE.BufferGeometry, mat: THREE.Material, shadows: boolean): THREE.Mesh {
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}

export function buildInterior(p: BodyProfile, cv: CurveSet, livery: Livery, mat: THREE.Material, displayMat: THREE.Material | null, liner: THREE.BufferGeometry, zTail: number): Interior {
  const eye = new THREE.Vector3(...p.eye);
  const zHoop = eye.z - 0.32;
  const cc = p.cockpit === 'classic' ? classicCockpit(p, cv, eye) : null;
  const d = cc ? cc.dash : mouldedDash(p, cv, eye);
  // The classic wheel is bigger: its column sits lower, more raked and further from the dash.
  const wheelCentre = cc ? new THREE.Vector3(eye.x, eye.y - 0.35, eye.z + 0.4) : new THREE.Vector3(eye.x, eye.y - 0.275, eye.z + 0.42);
  const column = cc ? new THREE.Vector3(0, -0.45, 1).normalize() : new THREE.Vector3(0, -0.34, 1).normalize();
  const glove = 0x18191b;

  const cabin = new THREE.Group();
  cabin.name = 'cabin';
  // The liner is merged in as built (one draw call); it stays put when the shell dents.
  const driver = buildDriver(eye, wheelCentre, { suit: livery.secondary, helmet: livery.primary, stripe: livery.accent, visor: 0x14181c, glove }, cc ? CLASSIC_RIM_R : undefined);
  cabin.add(named('cabin-body', merge([tint(liner.clone(), 0x2b2c30), seat(eye, cc ? 0x9c8a6a : 0x1d1e21), driver, d.geo, bulkheads(p, zHoop, d.top)]), mat, true));

  const wheelPose = (o: THREE.Object3D) => {
    o.position.copy(wheelCentre);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), column);
  };
  const outside = new THREE.Group();
  outside.name = 'cabin-outside';
  const simpleWheel = named('wheel-simple', cc ? classicWheel(false, glove) : steeringWheel(false, glove), mat, false);
  wheelPose(simpleWheel);
  outside.add(named('cage-simple', buildCage(p, cv, zHoop, CAGE, CAGE_SIMPLE), mat, true), simpleWheel);

  const group = new THREE.Group();
  group.name = 'interior';
  const mirror = buildInteriorMirror(p, cv, zTail);
  const cage = buildCage(p, cv, zHoop, CAGE, CAGE_DETAIL);
  const columnTube = tube([wheelCentre.clone().addScaledVector(column, 0.03), wheelCentre.clone().addScaledVector(column, 0.4)], 0.022, 0x2a2b2e);
  if (cc) {
    group.add(named('cockpit', merge([cage, cc.detail, columnTube, mirror.frame]), mat, true), mirror.glass, named('gear-lever', cc.lever, mat, true));
    if (displayMat) group.add(named('classic-dials', cc.dials, displayMat, false));
  } else {
    const panelPlace = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0.819, 0.574), new THREE.Vector3(0, 0.574, -0.819));
    panelPlace.setPosition(eye.x + 0.4, d.top - 0.13, d.rearZ - 0.03);
    const disp = display(d, eye, displayMat);
    const detail = merge([
      cage,
      switchPanel(panelPlace),
      disp.bezel,
      displayCowl(d, eye),
      columnTube,
      tube([new THREE.Vector3(eye.x + 0.27, 0.28, eye.z + 0.3), new THREE.Vector3(eye.x + 0.25, 0.6, eye.z + 0.24)], 0.012, 0x8d9096),
      mirror.frame,
    ]);
    group.add(named('cockpit', detail, mat, true), mirror.glass);
    if (disp.screen) group.add(disp.screen);
  }

  const steering = new THREE.Group();
  steering.name = 'steering-wheel';
  wheelPose(steering);
  const gloves = { back: livery.secondary, palm: 0x2a2b2e, cuff: 0x1b1c1e };
  steering.add(named('steering-wheel-mesh', cc ? classicWheel(true, glove, gloves) : steeringWheel(true, glove, gloves), mat, true));
  steering.userData.base = steering.quaternion.clone();
  group.add(steering);
  return { group, cabin, outside, steering, mirror };
}
