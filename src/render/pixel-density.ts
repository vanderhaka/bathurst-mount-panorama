import type { QualityPreset } from '@/render/renderer';

const CAP = { low: 1, medium: 1.5, high: 2 } as const;

export function pixelRatioForQuality(quality: QualityPreset, requested = Infinity): number {
  const native = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.min(native, CAP[quality], Math.max(0.5, requested));
}
