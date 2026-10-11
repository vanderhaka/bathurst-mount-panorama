// Every visual tunable of the generated car models lives here (one typed object).
//
// LIVE values (applyCarLook updates them on an existing model, no rebuild):
//   paint, glass, glassTint, rim, nut, tyre, plastic, carbon, trim, disc, caliper, lights,
//   interior, ghost, damage (read at the next impact).
// REBUILD values (read only when createCarModel runs):
//   segments.* (mesh density and livery atlas size per detail level), nut.colour
//   (baked into the rim mesh as vertex colours), and at detail 'low' the tyre
//   and rim colours (baked into one merged wheel mesh).
// Shapes (body curves, lights, wing, cockpit) live in the per-car profiles.
import * as THREE from 'three';
import type { CarModel } from '@/types/car-model';

export interface PaintLook {
  roughness: number; metalness: number; clearcoat: number; clearcoatRoughness: number; envMapIntensity: number;
  /** Clearcoat orange-peel normal strength (0 = flat clearcoat). */
  orangePeel: number;
  /** Flake normal strength under the clearcoat. */
  flake: number;
}
export interface SurfaceLook { colour: number; roughness: number; metalness: number; envMapIntensity: number; /** Physical materials only (carbon, trim, head, tail). */ clearcoat?: number }
export interface GlassLook extends SurfaceLook {
  opacity: number;
  /** Index of refraction (windscreen ~1.5). */
  ior: number;
  /** Reflection boost at grazing angles (MeshPhysicalMaterial reflectivity alternative via ior). */
  reflectivity: number;
}
export interface DiscLook extends SurfaceLook { glowColour: number; glowMax: number }
export interface LightsLook {
  headColour: number; headIntensity: number;
  tailColour: number; tailIntensity: number;
  /** Deeper red when braking: ACES turns a very bright light red towards orange. */
  brakeColour: number; brakeIntensity: number;
  brokenColour: number;
}
export interface DamageLook {
  /** Dent depth (m) for a severity-1 hit (half of it at severity 0.5). */ dentStrength: number;
  /** Dent radius (m) for a severity-1 hit (scaled down for light hits). */ dentRadius: number;
  /** Maximum accumulated displacement of any vertex (m). */ maxDent: number;
  /** Paint darkening per unit severity. */ scuffStrength: number;
  /** Front-zone level at which the splitter and bumper corners drop and skew. */ splitterHang: number;
  /** Front-zone level at which the splitter drags on the ground. */ splitterDrag: number;
  /** Aero level at which the wing starts to bend. */ wingTilt: number;
  /** Aero level at which the wing hangs off one upright. */ wingHang: number;
  /** Single rear hit severity that tears a hanging wing off. */ wingBreak: number;
  /** Severity at which a nearby head/tail light breaks. */ lightBreakSeverity: number;
}
export interface GhostLook { colour: number; opacity: number }
export interface SegmentLook {
  /** Body ring samples per span multiplier and longitudinal spacing (m). */
  bodyStep: number; archRows: number; capRows: number; ringDetail: 'high' | 'low';
  tyreRadial: number; tyreProfile: 'high' | 'low'; spokes: number; discRadial: number;
  /** Livery canvas size (px). */ atlasWidth: number; atlasHeight: number;
}

export interface CarLook {
  paint: PaintLook;
  glass: GlassLook;
  /** Side and rear windows (darker and more opaque than the windscreen). */
  glassTint: GlassLook;
  rim: SurfaceLook;
  nut: SurfaceLook;
  tyre: SurfaceLook;
  plastic: SurfaceLook;
  carbon: SurfaceLook;
  trim: SurfaceLook;
  disc: DiscLook;
  caliper: SurfaceLook;
  interior: SurfaceLook;
  /** Soft dark blob under the body (opacity 0 hides it). */
  contactShadow: { opacity: number };
  lights: LightsLook;
  damage: DamageLook;
  ghost: GhostLook;
  segments: { high: SegmentLook; low: SegmentLook };
}

export const CAR_LOOK: CarLook = {
  // Dielectric binder + clearcoat (not a metal): flakes live in the roughness/normal maps.
  paint: { roughness: 0.36, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.028, envMapIntensity: 1.55, orangePeel: 0.22, flake: 0.4 },
  glass: { colour: 0x0a141c, roughness: 0.02, metalness: 0, envMapIntensity: 2.0, opacity: 0.72, ior: 1.52, reflectivity: 0.55 },
  glassTint: { colour: 0x050910, roughness: 0.025, metalness: 0, envMapIntensity: 1.75, opacity: 0.88, ior: 1.5, reflectivity: 0.5 },
  // Gunmetal alloy; the polished lip is baked as vertex colours (RIM_LIP in wheels.ts).
  rim: { colour: 0x5b5f66, roughness: 0.36, metalness: 0.72, envMapIntensity: 1.2 },
  nut: { colour: 0xc8261e, roughness: 0.35, metalness: 0.6, envMapIntensity: 1 },
  tyre: { colour: 0x1a1a1c, roughness: 0.88, metalness: 0, envMapIntensity: 0.45 },
  plastic: { colour: 0x151618, roughness: 0.72, metalness: 0, envMapIntensity: 0.8 },
  carbon: { colour: 0x1a1c20, roughness: 0.35, metalness: 0.15, envMapIntensity: 0.8, clearcoat: 0.6 },
  trim: { colour: 0xffffff, roughness: 0.4, metalness: 0.2, envMapIntensity: 1, clearcoat: 0.45 },
  // Steel face (the drilled map multiplies it); the glow blooms at full brake temperature.
  disc: { colour: 0xb4b9c1, roughness: 0.38, metalness: 0.85, envMapIntensity: 1, glowColour: 0xff4a12, glowMax: 3.6 },
  caliper: { colour: 0xb81d1d, roughness: 0.4, metalness: 0.3, envMapIntensity: 1 },
  interior: { colour: 0xffffff, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.6 },
  contactShadow: { opacity: 0.55 },
  lights: {
    // Bloom starts at about 3.0 on High (threshold 2.2 before exposure): head and brake lights bloom, running tail lights do not.
    headColour: 0xf4f7ff, headIntensity: 3.6,
    tailColour: 0xff0606, tailIntensity: 1.4, brakeColour: 0xff0000, brakeIntensity: 3.6,
    brokenColour: 0x161719,
  },
  damage: {
    dentStrength: 0.2, dentRadius: 0.65, maxDent: 0.22, scuffStrength: 1.6,
    splitterHang: 0.4, splitterDrag: 0.75, wingTilt: 0.5, wingHang: 0.7, wingBreak: 0.85,
    lightBreakSeverity: 0.2,
  },
  ghost: { colour: 0xbff4ff, opacity: 0.35 },
  segments: {
    high: { bodyStep: 0.085, archRows: 15, capRows: 9, ringDetail: 'high', tyreRadial: 48, tyreProfile: 'high', spokes: 10, discRadial: 40, atlasWidth: 2048, atlasHeight: 1280 },
    low: { bodyStep: 0.26, archRows: 7, capRows: 3, ringDetail: 'low', tyreRadial: 16, tyreProfile: 'low', spokes: 5, discRadial: 14, atlasWidth: 1024, atlasHeight: 640 },
  },
};

/** Partial look: any top-level group, any subset of its fields. */
export type CarLookPatch = { [K in keyof CarLook]?: Partial<CarLook[K]> };

/** Materials a model registers so that applyCarLook can retune them live. */
export interface CarMaterialSet {
  paint: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  glassTint: THREE.MeshPhysicalMaterial;
  /** Recessed grille and intake interiors (livery atlas map, matt). */
  grille: THREE.MeshStandardMaterial | null;
  banner: THREE.MeshStandardMaterial | null;
  rim: THREE.MeshStandardMaterial;
  nut: THREE.MeshStandardMaterial | null;
  tyre: THREE.MeshStandardMaterial;
  plastic: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  disc: THREE.MeshStandardMaterial | null;
  caliper: THREE.MeshStandardMaterial | null;
  interior: THREE.MeshStandardMaterial | null;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  broken: THREE.MeshStandardMaterial;
  /** Contact-shadow blob material (opacity is live). */
  contact?: THREE.MeshBasicMaterial;
  ghost: THREE.MeshStandardMaterial;
}

interface Registered { look: CarLook; materials: CarMaterialSet; brakeOn: () => boolean; brakeGlow: () => number }
const registry = new WeakMap<CarModel, Registered>();

/** Deep copy of a look (so a model owns its values). */
export function cloneLook(look: CarLook = CAR_LOOK): CarLook {
  return JSON.parse(JSON.stringify(look)) as CarLook;
}

export function registerCarLook(model: CarModel, entry: Registered): void {
  registry.set(model, entry);
}

/** Current look of a model (live values). */
export function getCarLook(model: CarModel): CarLook | undefined {
  return registry.get(model)?.look;
}

function setSurface(m: THREE.MeshStandardMaterial | null, s: SurfaceLook): void {
  if (!m) return;
  m.color.setHex(s.colour);
  m.roughness = s.roughness;
  m.metalness = s.metalness;
  m.envMapIntensity = s.envMapIntensity;
  if (s.clearcoat !== undefined && m instanceof THREE.MeshPhysicalMaterial) m.clearcoat = s.clearcoat;
}

/** Tail-lamp glow for the running-light or brake state. */
export function setTailGlow(mats: CarMaterialSet, look: CarLook, brakeOn: boolean): void {
  const l = look.lights;
  mats.tail.emissive.setHex(brakeOn ? l.brakeColour : l.tailColour);
  mats.tail.emissiveIntensity = brakeOn ? l.brakeIntensity : l.tailIntensity;
}

/** Writes the look's material values into a model's materials. */
export function writeMaterials(mats: CarMaterialSet, look: CarLook, brakeOn: boolean, glow: number): void {
  const p = look.paint;
  Object.assign(mats.paint, { roughness: p.roughness, metalness: p.metalness, clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness, envMapIntensity: p.envMapIntensity });
  mats.paint.clearcoatNormalScale?.set(p.orangePeel, p.orangePeel);
  mats.paint.normalScale?.set(p.flake, p.flake);
  setSurface(mats.glass, look.glass);
  mats.glass.opacity = mats.glass.transparent ? look.glass.opacity : 1;
  mats.glass.ior = look.glass.ior;
  mats.glass.reflectivity = look.glass.reflectivity;
  setSurface(mats.glassTint, look.glassTint);
  mats.glassTint.opacity = mats.glassTint.transparent ? look.glassTint.opacity : 1;
  mats.glassTint.ior = look.glassTint.ior;
  mats.glassTint.reflectivity = look.glassTint.reflectivity;
  setSurface(mats.rim, look.rim);
  setSurface(mats.nut, look.nut);
  setSurface(mats.tyre, look.tyre);
  const baked = mats.tyre.userData.bakedColour as number | undefined;
  if (baked !== undefined) {
    // The lettering texture carries the tyre colour it was painted with: scale towards the requested one.
    const b = new THREE.Color(baked);
    mats.tyre.color.r /= Math.max(0.01, b.r);
    mats.tyre.color.g /= Math.max(0.01, b.g);
    mats.tyre.color.b /= Math.max(0.01, b.b);
  }
  setSurface(mats.plastic, look.plastic);
  if (mats.grille) {
    mats.grille.roughness = look.plastic.roughness;
    mats.grille.envMapIntensity = look.plastic.envMapIntensity * 0.4;
  }
  setSurface(mats.carbon, look.carbon);
  setSurface(mats.trim, look.trim);
  setSurface(mats.caliper, look.caliper);
  setSurface(mats.interior, look.interior);
  if (mats.disc) {
    setSurface(mats.disc, look.disc);
    mats.disc.emissive.setHex(look.disc.glowColour);
    mats.disc.emissiveIntensity = glow * look.disc.glowMax;
  }
  const l = look.lights;
  mats.head.color.setHex(l.headColour);
  mats.head.emissive.setHex(l.headColour);
  mats.head.emissiveIntensity = l.headIntensity;
  // Dark base so sunlight does not wash the red towards orange; the glow comes from emissive.
  mats.tail.color.setHex(l.tailColour).multiplyScalar(0.25);
  setTailGlow(mats, look, brakeOn);
  mats.broken.color.setHex(l.brokenColour);
  if (mats.contact) mats.contact.opacity = look.contactShadow.opacity;
  mats.ghost.color.setHex(look.ghost.colour);
  mats.ghost.emissive.setHex(look.ghost.colour);
  mats.ghost.opacity = look.ghost.opacity;
}

/**
 * Updates the live material values of an existing model (no rebuild). Geometry
 * values (segments.*) are stored but only take effect on the next createCarModel.
 */
export function applyCarLook(model: CarModel, look: CarLookPatch | Partial<CarLook>): void {
  const entry = registry.get(model);
  if (!entry) return;
  const current = entry.look as unknown as Record<string, Record<string, unknown>>;
  for (const [key, value] of Object.entries(look)) {
    if (value && typeof value === 'object') current[key] = { ...current[key], ...(value as Record<string, unknown>) };
  }
  writeMaterials(entry.materials, entry.look, entry.brakeOn(), entry.brakeGlow());
}
