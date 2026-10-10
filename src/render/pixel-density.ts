import type { QualityPreset } from '@/render/renderer';

const CAP = { low: 1, medium: 1.5, high: 2 } as const;

export function pixelRatioForQuality(quality: QualityPreset, requested = Infinity): number {
  const native = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(native, CAP[quality], Math.max(0.5, requested));
}

/**
 * Very large canvases (5K and 6K displays at a 2x ratio, about 15-20 MP) are capped to the pixels of a 3840x2160
 * buffer: past that, a 4x MSAA half-float scene target costs far more than the extra density shows. Common laptop and
 * 4K screens stay at their tier ratio, and the cap never takes a display below 1x.
 */
export const MAX_BUFFER_PIXELS = 3840 * 2160;

export function capPixelRatio(ratio: number, cssWidth: number, cssHeight: number, maxPixels = MAX_BUFFER_PIXELS): number {
  const area = cssWidth * cssHeight;
  if (!(area > 0) || area * ratio * ratio <= maxPixels) return ratio;
  return Math.max(Math.min(ratio, 1), Math.sqrt(maxPixels / area));
}
