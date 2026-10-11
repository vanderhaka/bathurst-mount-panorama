// Shootout warm-up start, per mode (this browser only, best effort). Every mode starts on the grid; the player may
// choose the rolling start just after Forrest's Elbow instead.
import type { ShootoutMode } from '@/types/session';

export type WarmupStart = 'rolling' | 'grid';

// v2: grid became the default. v1 stored 'rolling' as its default, so it is ignored rather than migrated.
const KEY = (mode: ShootoutMode) => `bathurst.shootout.warmupStart.v2.${mode}`;

/** The remembered start for this mode; 'grid' unless the player picked the rolling start. */
export function loadWarmupStart(mode: ShootoutMode): WarmupStart {
  try {
    return localStorage.getItem(KEY(mode)) === 'rolling' ? 'rolling' : 'grid';
  } catch { return 'grid'; }
}

export function saveWarmupStart(mode: ShootoutMode, start: WarmupStart): void {
  try { localStorage.setItem(KEY(mode), start); } catch { /* storage full or blocked */ }
}
