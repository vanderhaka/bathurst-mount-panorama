import * as THREE from 'three';
import { QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';

export function liveryAtlasSize(width: number, height: number, quality: QualityPreset): [number, number] {
  const scale = Math.min(1, QUALITY[quality].liveryAtlasSize / Math.max(width, height));
  return [Math.floor(width * scale), Math.floor(height * scale)];
}

/** Repaints at the new resolution, then releases the old GPU texture storage. */
export function resizeCanvasTexture(texture: THREE.CanvasTexture, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
  const canvas = texture.image as HTMLCanvasElement;
  if (canvas.width === width && canvas.height === height) return;
  const target = canvas.getContext('2d');
  if (!target) return;
  canvas.width = width; canvas.height = height;
  paint(target);
  texture.dispose();
  texture.needsUpdate = true;
}
