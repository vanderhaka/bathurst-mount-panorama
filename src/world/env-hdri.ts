// Streams a CC0 outdoor HDRI (KTX2) for car reflections. Low tier never loads it.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { QualityPreset } from '@/render/renderer';
import { QUALITY } from '@/config/graphics';

/** Poly Haven "Rural Asphalt Road" 1k, UASTC KTX2 (see docs/ASSETS.md). */
export const HDRI_URL = '/env/rural_asphalt_road_1k.ktx2';
const BASIS_PATH = '/basis/';

let loader: KTX2Loader | null = null;
let pending: Promise<THREE.Texture | null> | null = null;
let cached: THREE.Texture | null = null;

function ktx2(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (loader) return loader;
  loader = new KTX2Loader().setTranscoderPath(BASIS_PATH);
  loader.detectSupport(renderer);
  return loader;
}

/** True when this tier streams the outdoor HDRI. */
export function hdriEnabled(quality: QualityPreset): boolean {
  return QUALITY[quality].hdriEnv;
}

/**
 * Loads the outdoor HDRI once (shared). Resolves null on Low, missing file, or decode failure
 * so the sky-only environment map stays in place.
 */
export function loadCarHdri(renderer: THREE.WebGLRenderer, quality: QualityPreset): Promise<THREE.Texture | null> {
  if (!hdriEnabled(quality)) return Promise.resolve(null);
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = ktx2(renderer).loadAsync(HDRI_URL).then((tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    cached = tex;
    return tex;
  }).catch(() => null).finally(() => { pending = null; });
  return pending;
}
