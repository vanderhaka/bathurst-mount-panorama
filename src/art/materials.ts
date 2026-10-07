import * as THREE from 'three';

// Shared material factory. Medium-poly assets carry their albedo in vertex
// colours, so most meshes share a few white-based materials (few draw-state
// changes, and instance colours are not multiplied twice — see lessons).

export interface VertexColourMaterialOptions {
  roughness?: number;
  metalness?: number;
  flat?: boolean;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

const cache = new Map<string, THREE.Material>();

/** White-based MeshStandardMaterial that reads albedo from the `color` attribute. Cached by options. */
export function vertexColourMaterial(opts: VertexColourMaterialOptions = {}): THREE.MeshStandardMaterial {
  const key = `vc:${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flat ?? true,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  cache.set(key, m);
  return m;
}

/** Plain coloured MeshStandardMaterial. Cached by colour and options. */
export function solidMaterial(colour: number, opts: Omit<VertexColourMaterialOptions, 'emissive'> & { emissive?: number } = {}): THREE.MeshStandardMaterial {
  const key = `solid:${colour}:${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    flatShading: opts.flat ?? true,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  cache.set(key, m);
  return m;
}

const tmpColour = new THREE.Color();

/**
 * Writes one sRGB hex colour into the geometry's `color` attribute (created if
 * missing). Colours are converted to linear, which is what three.js expects.
 */
export function paintGeometry(geometry: THREE.BufferGeometry, colour: number, jitter = 0, seed = 1): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  let attr = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!attr || attr.count !== count) {
    attr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', attr);
  }
  tmpColour.setHex(colour);
  let s = seed;
  for (let i = 0; i < count; i++) {
    let k = 1;
    if (jitter > 0) {
      s = (s * 16807) % 2147483647;
      k = 1 + ((s / 2147483647) * 2 - 1) * jitter;
    }
    attr.setXYZ(i, tmpColour.r * k, tmpColour.g * k, tmpColour.b * k);
  }
  attr.needsUpdate = true;
  return geometry;
}

/** Converts an sRGB hex colour to a linear THREE.Color (new instance). */
export function linearColour(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex);
}
