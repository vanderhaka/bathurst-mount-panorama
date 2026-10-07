import * as THREE from 'three';
import { getGraphics } from '@/config/graphics';
import { TONE_MAPPING } from '@/render/tone-mapping';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface RendererOptions {
  canvas?: HTMLCanvasElement;
  quality?: QualityPreset;
  preserveDrawingBuffer?: boolean;
}

const PIXEL_RATIO_CAP: Record<QualityPreset, number> = { low: 1, medium: 1.5, high: 2 };

/** Creates the WebGL renderer with the colour pipeline every scene in the project uses. */
export function createRenderer(opts: RendererOptions = {}): THREE.WebGLRenderer {
  const quality = opts.quality ?? 'high';
  const renderer = new THREE.WebGLRenderer({
    canvas: opts.canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[getGraphics().toneMapping];
  renderer.toneMappingExposure = getGraphics().exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function setRendererQuality(renderer: THREE.WebGLRenderer, quality: QualityPreset): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
}
