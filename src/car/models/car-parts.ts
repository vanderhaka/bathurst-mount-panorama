// Builds every part of one car and arranges the scene graph:
// root -> body (sprung: shell, glass, aero, lights, interior, anchors)
//      -> wheels (instanced, unsprung).
import * as THREE from 'three';
import { QUALITY } from '@/config/graphics';
import { liveryAtlasSize } from '@/car/models/texture-quality';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import type { CarModelOptions } from '@/types/car-model';
import { CAMARO_PROFILE } from '@/car/models/camaro-profile';
import { MUSTANG_PROFILE } from '@/car/models/mustang-profile';
import { SUPRA_PROFILE } from '@/car/models/supra-profile';
import { TORANA_PROFILE } from '@/car/models/torana-profile';
import { resolveProfile } from '@/car/models/profile-resolve';
import { buildBodyGrid, type BodyGrid } from '@/car/models/body-grid';
import { buildBodyMeshes, type BodyMeshes } from '@/car/models/body-mesh';
import { compileCurves } from '@/car/models/body-section';
import { createWheels, type WheelSet } from '@/car/models/wheels';
import { GEN3_WHEEL } from '@/car/models/wheel-geometry';
import { createCarMaterials } from '@/car/models/car-materials';
import { cloneLook, writeMaterials, type CarLook, type CarMaterialSet } from '@/car/models/look';
import { createLiveryTextures, createTyreTexture, type LiveryTextures } from '@/car/models/livery-texture';
import { buildLights, type LightSet } from '@/car/models/lights';
import { buildFrontAero } from '@/car/models/aero-front';
import { buildRearAero } from '@/car/models/aero-rear';
import { buildBodyDetails } from '@/car/models/aero-details';
import { buildFascia } from '@/car/models/fascia';
import { buildBoltOns } from '@/car/models/body-bolt-on';
import { merge, tint } from '@/car/models/geo-utils';
import { CARBON_UV_SCALE, boxUvs } from '@/car/models/carbon';
import type { BodyProfile } from '@/car/models/profile-types';
import { createContactShadow } from '@/car/models/contact-shadow';
import { buildInterior, type Interior } from '@/car/models/interior';

const PROFILES = { camaro: CAMARO_PROFILE, mustang: MUSTANG_PROFILE, supra: SUPRA_PROFILE, torana: TORANA_PROFILE } as const;
/** Diffuser tone in the trim mesh (satin dark composite). */
const DIFFUSER_COLOUR = 0x1c1d20;

export interface HingedPart { pivot: THREE.Group; meshes: THREE.Mesh[] }

export interface CarParts {
  root: THREE.Group;
  body: THREE.Group;
  grid: BodyGrid;
  shell: BodyMeshes;
  profile: BodyProfile;
  look: CarLook;
  mats: CarMaterialSet & { display: THREE.MeshBasicMaterial | null; amber?: THREE.MeshStandardMaterial };
  tex: LiveryTextures | null;
  plastic: THREE.Mesh;
  trim: THREE.Mesh;
  splitter: HingedPart | null;
  wing: HingedPart | null;
  lights: LightSet;
  wheels: WheelSet;
  interior: Interior | null;
  /** Painted flare lips and bolts (profiles with flares only). */
  flares: THREE.Mesh | null;
  /** Nose face with real openings, and the opening recesses (detail 'high'). */
  fascia: THREE.Mesh[];
  /** Front-most and rear-most body z. */
  zFront: number;
  zRear: number;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], name: string, shadows = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.name = name;
  out.castShadow = shadows;
  out.receiveShadow = shadows;
  return out;
}

function hinged(name: string, hinge: THREE.Vector3, meshes: THREE.Mesh[]): HingedPart {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.copy(hinge);
  pivot.userData.hinge = hinge.clone();
  const inner = new THREE.Group();
  inner.position.copy(hinge).negate();
  inner.add(...meshes);
  pivot.add(inner);
  return { pivot, meshes };
}

export function buildCarParts(kind: CarKind, options: CarModelOptions): CarParts {
  const high = (options.detail ?? 'high') === 'high';
  const look = cloneLook();
  const seg = high ? look.segments.high : look.segments.low;
  const dims = CAR_SPECS[kind].dimensions;
  const profile = resolveProfile(PROFILES[kind], dims);
  const cv = compileCurves(profile.curves);
  const grid = buildBodyGrid(profile, dims, { detail: seg.ringDetail, step: seg.bodyStep, archRows: seg.archRows, capRows: seg.capRows });
  const shell = buildBodyMeshes(grid, high, high);
  let zFront = -Infinity;
  let zRear = Infinity;
  for (let i = 2; i < grid.rest.length; i += 3) { zFront = Math.max(zFront, grid.rest[i]); zRear = Math.min(zRear, grid.rest[i]); }
  const l = options.livery;
  const [width, height] = liveryAtlasSize(seg.atlasWidth, seg.atlasHeight, options.quality ?? 'high');
  const tex = createLiveryTextures(l, { kind, profile, zFront, zRear, axleZ: dims.wheelbase / 2, wheelR: dims.wheelRadius }, width, height);
  const paintDetail = QUALITY[options.quality ?? 'high'].carPaintDetail && high;
  const mats: CarParts['mats'] = createCarMaterials({
    look, paintMap: tex?.paint ?? null, bannerMap: tex?.banner ?? null, displayMap: tex?.display ?? null,
    primary: l.primary, high, paintDetail, discRadius: (profile.wheel ?? GEN3_WHEEL).discRadius,
  });
  // Amber tail-lamp sections: an unlit amber lens that never takes the brake glow.
  if (profile.taillight.amber) mats.amber = new THREE.MeshStandardMaterial({ name: 'car-amber', color: 0xff7400, emissive: 0xff5200, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0 });

  const root = new THREE.Group();
  root.name = `car-${kind}`;
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  body.add(mesh(shell.paint.geometry, mats.paint, 'paint'));
  body.add(mesh(shell.glass.geometry, mats.glass, 'glass', false));
  if (high) body.add(mesh(shell.tinted.geometry, mats.glassTint, 'glass-tinted', false));
  body.add(mesh(shell.dark.geometry, mats.plastic, 'underside'));
  if (high && mats.banner) body.add(mesh(shell.banner.geometry, mats.banner, 'banner', false));
  const fasciaGeo = high ? buildFascia(grid, profile, high) : null;
  const fascia: THREE.Mesh[] = [];
  if (fasciaGeo && mats.grille) {
    fascia.push(mesh(fasciaGeo.face, mats.paint, 'paint-face'), mesh(fasciaGeo.recess, mats.grille, 'grille-recess'));
    body.add(...fascia);
  }

  const front = buildFrontAero(grid, profile, cv, dims, l.secondary);
  const rear = buildRearAero(grid, profile, zRear, -dims.wheelbase / 2 - 0.32);
  // Endplates in the livery colour; the diffuser and lamp housings join the trim mesh.
  const plates = rear.wingPlates ? tint(rear.wingPlates, l.primary) : null;
  const lights = buildLights(grid, profile, mats.head, mats.tail, high, fasciaGeo?.face ?? null, mats.amber ?? null);
  let splitter: HingedPart | null = null;
  let wing: HingedPart | null = null;
  const boltOns = buildBoltOns(grid, profile, cv, dims.wheelbase / 2, dims.wheelRadius, high);
  const plasticParts = [...front.plastic, ...rear.plastic, ...buildBodyDetails(grid, profile, high), ...boltOns.plastic];
  if (fasciaGeo?.strut) plasticParts.push(fasciaGeo.strut);
  const trimParts = [...front.trim, ...rear.diffuser.map((g) => tint(g, DIFFUSER_COLOUR)), ...lights.housings.map((h) => tint(h.geometry, h.colour))];
  if (high) {
    if (front.splitter && front.splitterHinge) {
      splitter = hinged('splitter', front.splitterHinge, [mesh(boxUvs(front.splitter, CARBON_UV_SCALE), mats.carbon, 'splitter')]);
      body.add(splitter.pivot);
    }
    if (rear.wingCarbon && rear.wingHinge && plates && profile.wing) {
      wing = hinged('wing', rear.wingHinge, [mesh(boxUvs(rear.wingCarbon, CARBON_UV_SCALE), mats.carbon, 'wing'), mesh(plates, mats.trim, 'wing-endplates')]);
      wing.pivot.userData.uprightX = profile.wing.uprightX;
      wing.pivot.userData.wingY = profile.wing.y;
      body.add(wing.pivot);
    }
  } else {
    if (front.splitter) plasticParts.push(front.splitter);
    if (rear.wingCarbon) plasticParts.push(rear.wingCarbon);
    if (plates) trimParts.push(plates);
  }
  const plastic = mesh(merge(plasticParts), mats.plastic, 'aero');
  const trim = mesh(merge(trimParts), mats.trim, 'trim');
  body.add(plastic, trim);
  const flares = boltOns.paint ? mesh(boltOns.paint, mats.paint, 'paint-flares') : null;
  if (flares) body.add(flares);
  body.add(lights.head, lights.tail);
  if (lights.amber) body.add(lights.amber);

  const tyreMap = high ? createTyreTexture(look.tyre.colour, profile.wheel?.kind === 'classic') : null;
  if (tyreMap) {
    mats.tyre.map = tyreMap;
    mats.tyre.userData.bakedColour = look.tyre.colour;
    writeMaterials(mats, look, false, 0);
  }
  const wheels = createWheels(dims, mats, seg, high, look, profile.wheel);
  root.add(wheels.group);
  // Unsprung (root), so it stays flat on the road while the body pitches and rolls.
  const shadow = createContactShadow(zFront - zRear + 0.5, dims.trackFront + dims.tyreWidth + 0.5, (zFront + zRear) / 2, look.contactShadow.opacity);
  mats.contact = shadow.material;
  root.add(shadow.mesh);

  let interior: Interior | null = null;
  if (high && mats.interior && shell.shell) {
    interior = buildInterior(profile, cv, l, mats.interior, mats.display, shell.shell.geometry, zRear);
    body.add(interior.cabin, interior.outside, interior.group, interior.mirror.eye);
  } else {
    // No cabin behind the glass at low detail: keep the glass opaque so the car never looks hollow.
    for (const g of [mats.glass, mats.glassTint]) {
      g.transparent = false;
      g.depthWrite = true;
    }
  }
  return { root, body, grid, shell, profile, look, mats, tex, plastic, trim, splitter, wing, lights, wheels, interior, flares, fascia, zFront, zRear };
}
