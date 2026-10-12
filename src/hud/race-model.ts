// Pure helpers for the race HUD: which rows the tower shows, driver codes and the interval column.
import type { RaceRow } from '@/types/race';

/** Tower rows on desktop: 7 opponents plus the player. */
export const TOWER_ROWS = 8;

/** Three-letter code: first three letters of the name, uppercased; 'YOU' for the player. */
export function driverCode(row: Pick<RaceRow, 'name' | 'isPlayer'>): string {
  if (row.isPlayer) return 'YOU';
  const letters = row.name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters || row.name.toUpperCase()).slice(0, 3);
}

/**
 * Indices of the rows to show, in running order. A field that fits is shown whole; a longer one shows the
 * leader plus the window around the player.
 */
export function selectRows(rows: readonly RaceRow[], max: number = TOWER_ROWS): number[] {
  const n = rows.length;
  const all = Array.from({ length: Math.min(n, max) }, (_, i) => i);
  if (n <= max) return all;
  const p = Math.max(0, rows.findIndex((r) => r.isPlayer));
  if (p < max - 1) return all;
  // Leader, then the max-1 rows ending at (or just past) the player.
  const rest = max - 1;
  const end = Math.min(n - 1, p + Math.floor(rest / 2));
  const start = end - rest + 1;
  return [0, ...Array.from({ length: rest }, (_, k) => start + k)];
}

/** Interval column: LEADER, FIN once the car has the flag, '+1 LAP' when a lap down on the car ahead, else the gap to the car ahead. */
export function formatInterval(rows: readonly RaceRow[], i: number): string {
  const r = rows[i];
  if (r.finished) return 'FIN';
  if (i === 0) return 'LEADER';
  const ahead = rows[i - 1];
  const lapsBehind = r.lapsDown - ahead.lapsDown;
  if (lapsBehind > 0) return `+${lapsBehind} LAP${lapsBehind > 1 ? 'S' : ''}`;
  if (r.gapS === null || (i > 1 && ahead.gapS === null)) return '';
  const d = r.gapS - (ahead.gapS ?? 0);
  return `+${Math.max(0, d).toFixed(3)}`;
}
