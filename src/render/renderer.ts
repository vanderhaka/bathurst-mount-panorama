import * as THREE from 'three';
import { getGraphics } from '@/config/graphics';
import { TONE_MAPPING } from '@/render/tone-mapping';
import { pixelRatioForQuality } from '@/render/pixel-density';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface RendererOptions {
  canvas?: HTMLCanvasElement;
  quality?: QualityPreset;
  pixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  /** MSAA on the canvas itself. Tiers with a post chain antialias in their own target and only draw one quad here. */
  antialias?: boolean;
}

/** Creates the WebGL renderer with the colour pipeline every scene in the project uses. */
export function createRenderer(opts: RendererOptions = {}): THREE.WebGLRenderer {
  const quality = opts.quality ?? 'high';
  const renderer = new THREE.WebGLRenderer({
    canvas: opts.canvas,
    antialias: opts.antialias ?? true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
  });
  renderer.setPixelRatio(pixelRatioForQuality(quality, opts.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[getGraphics().toneMapping];
  renderer.toneMappingExposure = getGraphics().exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

export function setRendererQuality(renderer: THREE.WebGLRenderer, quality: QualityPreset, pixelRatio?: number): void {
  renderer.setPixelRatio(pixelRatioForQuality(quality, pixelRatio));
}
