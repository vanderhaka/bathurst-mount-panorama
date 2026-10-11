// Materials of one car. Every value comes from the look (see look.ts); the
// same function (writeMaterials) is used for live tuning.
import * as THREE from 'three';
import { writeMaterials, type CarLook, type CarMaterialSet } from '@/car/models/look';
import { carbonMaps } from '@/car/models/carbon';
import { discMaps } from '@/car/models/disc-texture';
import { paintMaps } from '@/car/models/paint-maps';
import { tyreMaps } from '@/car/models/tyre-maps';

export interface MaterialInputs {
  look: CarLook;
  paintMap: THREE.Texture | null;
  bannerMap: THREE.Texture | null;
  displayMap: THREE.Texture | null;
  /** Fallback paint colour when no livery texture is available (tests / no DOM). */
  primary: number;
  high: boolean;
  /** Clearcoat flake / orange-peel and tyre detail maps (Medium+). */
  paintDetail: boolean;
  /** Brake disc outer radius (m), for the drilled-disc maps. */
  discRadius: number;
}

const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial(o);
const phys = (o: THREE.MeshPhysicalMaterialParameters = {}) => new THREE.MeshPhysicalMaterial(o);

/** Carbon weave: colour, roughness and normal tiles over a clearcoat (no maps without a DOM). */
function carbonMaterial(high: boolean): THREE.MeshPhysicalMaterial {
  const maps = high ? carbonMaps() : null;
  const m = phys(maps ? { map: maps.map, roughnessMap: maps.roughnessMap, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.45, 0.45) } : {});
  m.clearcoatRoughness = 0.22;
  m.name = 'car-carbon';
  return m;
}

/** Drilled, brushed disc whose face alone glows with the brake temperature. */
function discMaterial(radius: number): THREE.MeshStandardMaterial {
  const maps = discMaps(radius);
  const m = std({ side: THREE.DoubleSide, ...(maps ? { map: maps.map, emissiveMap: maps.emissiveMap } : {}) });
  m.name = 'car-disc';
  return m;
}

function applyPaintDetail(paint: THREE.MeshPhysicalMaterial, look: CarLook): void {
  const maps = paintMaps();
  if (!maps) return;
  paint.normalMap = maps.normalMap;
  paint.roughnessMap = maps.roughnessMap;
  paint.clearcoatNormalMap = maps.clearcoatNormalMap;
  paint.normalScale = new THREE.Vector2(look.paint.flake, look.paint.flake);
  paint.clearcoatNormalScale = new THREE.Vector2(look.paint.orangePeel, look.paint.orangePeel);
}

export function createCarMaterials(i: MaterialInputs): CarMaterialSet & { display: THREE.MeshBasicMaterial | null } {
  const paint = new THREE.MeshPhysicalMaterial({ color: i.paintMap ? 0xffffff : i.primary, map: i.paintMap, vertexColors: true });
  paint.name = 'car-paint';
  if (i.paintDetail) applyPaintDetail(paint, i.look);
  // Front side only: tinted from outside, clear from the cockpit.
  const glass = new THREE.MeshPhysicalMaterial({
    transparent: true, depthWrite: false, roughness: 0.02, metalness: 0,
    ior: i.look.glass.ior, reflectivity: i.look.glass.reflectivity,
    specularIntensity: 1, thickness: 0.008,
  });
  glass.name = 'car-glass';
  const glassTint = new THREE.MeshPhysicalMaterial({
    transparent: true, depthWrite: false, roughness: 0.025, metalness: 0,
    ior: i.look.glassTint.ior, reflectivity: i.look.glassTint.reflectivity,
    specularIntensity: 1, thickness: 0.006,
  });
  glassTint.name = 'car-glass-tint';
  const banner = std({ map: i.bannerMap, color: i.bannerMap ? 0xffffff : 0xf1f1ee, roughness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const tyreDetail = i.paintDetail ? tyreMaps() : null;
  const mats: CarMaterialSet & { display: THREE.MeshBasicMaterial | null } = {
    paint,
    glass,
    glassTint,
    grille: i.high ? std({ map: i.paintMap, color: i.paintMap ? 0xffffff : 0x111214, vertexColors: true, side: THREE.DoubleSide }) : null,
    banner,
    rim: std({ side: THREE.DoubleSide, vertexColors: true }),
    // The nut is merged into the rim mesh (vertex colours); no material of its own.
    nut: null,
    tyre: std({
      ...(tyreDetail ? { roughnessMap: tyreDetail.roughnessMap, normalMap: tyreDetail.normalMap, normalScale: new THREE.Vector2(0.55, 0.55) } : {}),
    }),
    plastic: std(),
    carbon: carbonMaterial(i.high),
    // Mirrors, exhaust tips, lamp housings, endplates and the diffuser: vertex colours under a satin clearcoat.
    trim: phys({ vertexColors: true, clearcoatRoughness: 0.2 }),
    disc: i.high ? discMaterial(i.discRadius) : null,
    caliper: i.high ? std() : null,
    interior: i.high ? std({ vertexColors: true }) : null,
    // Emissive cores under a glossy lens coat.
    head: phys({ roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 }),
    tail: phys({ roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    broken: std({ roughness: 0.3, metalness: 0.1 }),
    // Depth writes on: the shell (drawn first) hides everything inside it, so the ghost reads as one clean see-through car.
    ghost: std({ transparent: true, depthWrite: true, roughness: 0.5, metalness: 0, emissiveIntensity: 0.5 }),
    display: i.high ? new THREE.MeshBasicMaterial({ map: i.displayMap, color: i.displayMap ? 0xffffff : 0x203040, toneMapped: false }) : null,
  };
  writeMaterials(mats, i.look, false, 0);
  return mats;
}

/** Disposes every material (and its textures, except the tiles shared by every car) of a set. */
export function disposeMaterials(mats: Record<string, THREE.Material | null>): void {
  const seen = new Set<THREE.Texture>();
  for (const m of Object.values(mats)) {
    if (!m) continue;
    for (const v of Object.values(m)) if (v instanceof THREE.Texture && !seen.has(v) && !v.userData.shared) { seen.add(v); v.dispose(); }
    m.dispose();
  }
}
