// Shootout warm-up start, per mode (this browser only, best effort). Every mode starts rolling; once a timed lap
// has begun in a mode, the player may choose the standing start on the grid instead.
import type { ShootoutMode } from '@/types/session';

export type WarmupStart = 'rolling' | 'grid';

const KEY = (mode: ShootoutMode) => `bathurst.shootout.warmupStart.v1.${mode}`;

interface Stored { unlocked: boolean; start: WarmupStart }

function read(mode: ShootoutMode): Stored {
  try {
    const raw = localStorage.getItem(KEY(mode));
    if (!raw) return { unlocked: false, start: 'rolling' };
    const data = JSON.parse(raw) as { unlocked?: unknown; start?: unknown } | null;
    return { unlocked: data?.unlocked === true, start: data?.start === 'grid' ? 'grid' : 'rolling' };
  } catch { return { unlocked: false, start: 'rolling' }; }
}

function write(mode: ShootoutMode, value: Stored): void {
  try { localStorage.setItem(KEY(mode), JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

/** True once the player has started a timed lap in this mode (the grid option then appears). */
export function warmupChoiceUnlocked(mode: ShootoutMode): boolean {
  return read(mode).unlocked;
}

export function unlockWarmupChoice(mode: ShootoutMode): void {
  const current = read(mode);
  if (!current.unlocked) write(mode, { ...current, unlocked: true });
}

/** The remembered start for this mode; always 'rolling' while the choice is locked. */
export function loadWarmupStart(mode: ShootoutMode): WarmupStart {
  const current = read(mode);
  return current.unlocked ? current.start : 'rolling';
}

export function saveWarmupStart(mode: ShootoutMode, start: WarmupStart): void {
  write(mode, { ...read(mode), start });
}
