// Materials of one car. Every value comes from the look (see look.ts); the
// same function (writeMaterials) is used for live tuning.
import * as THREE from 'three';
import { writeMaterials, type CarLook, type CarMaterialSet } from '@/car/models/look';

export interface MaterialInputs {
  look: CarLook;
  paintMap: THREE.Texture | null;
  bannerMap: THREE.Texture | null;
  displayMap: THREE.Texture | null;
  /** Fallback paint colour when no livery texture is available (tests / no DOM). */
  primary: number;
  high: boolean;
}

const std = (o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial(o);

export function createCarMaterials(i: MaterialInputs): CarMaterialSet & { display: THREE.MeshBasicMaterial | null } {
  const paint = new THREE.MeshPhysicalMaterial({ color: i.paintMap ? 0xffffff : i.primary, map: i.paintMap, vertexColors: true });
  paint.name = 'car-paint';
  // Front side only: tinted from outside, clear from the cockpit.
  const glass = new THREE.MeshPhysicalMaterial({ transparent: true, depthWrite: false });
  glass.name = 'car-glass';
  const glassTint = new THREE.MeshPhysicalMaterial({ transparent: true, depthWrite: false });
  glassTint.name = 'car-glass-tint';
  const banner = std({ map: i.bannerMap, color: i.bannerMap ? 0xffffff : 0xf1f1ee, roughness: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const mats: CarMaterialSet & { display: THREE.MeshBasicMaterial | null } = {
    paint,
    glass,
    glassTint,
    grille: i.high ? std({ map: i.paintMap, color: i.paintMap ? 0xffffff : 0x111214, vertexColors: true, side: THREE.DoubleSide }) : null,
    banner,
    rim: std({ side: THREE.DoubleSide, vertexColors: true }),
    // The nut is merged into the rim mesh (vertex colours); no material of its own.
    nut: null,
    tyre: std(),
    plastic: std(),
    carbon: std(),
    trim: std({ vertexColors: true }),
    disc: i.high ? std({ side: THREE.DoubleSide }) : null,
    caliper: i.high ? std() : null,
    interior: i.high ? std({ vertexColors: true }) : null,
    head: std({ roughness: 0.15, metalness: 0 }),
    tail: std({ roughness: 0.2, metalness: 0 }),
    broken: std({ roughness: 0.3, metalness: 0.1 }),
    // Depth writes on: the shell (drawn first) hides everything inside it, so the ghost reads as one clean see-through car.
    ghost: std({ transparent: true, depthWrite: true, roughness: 0.5, metalness: 0, emissiveIntensity: 0.5 }),
    display: i.high ? new THREE.MeshBasicMaterial({ map: i.displayMap, color: i.displayMap ? 0xffffff : 0x203040, toneMapped: false }) : null,
  };
  writeMaterials(mats, i.look, false, 0);
  return mats;
}

/** Disposes every material (and its textures) of a set. */
export function disposeMaterials(mats: Record<string, THREE.Material | null>): void {
  const seen = new Set<THREE.Texture>();
  for (const m of Object.values(mats)) {
    if (!m) continue;
    for (const v of Object.values(m)) if (v instanceof THREE.Texture && !seen.has(v)) { seen.add(v); v.dispose(); }
    m.dispose();
  }
}
