// Pure formatting helpers for the HUD and menus. No DOM access: unit-tested in node.

export const KMH_PER_MPH = 1.609344;

export type SpeedUnits = 'kmh' | 'mph';
export type DeltaClass = 'faster' | 'slower' | 'even' | 'none';

const EMPTY_LAP = '-:--.---';
const EMPTY_SECTOR = '--.---';
const EMPTY_DELTA = '--.---';

export function kmhToMph(kmh: number): number {
  return kmh / KMH_PER_MPH;
}

export function mphToKmh(mph: number): number {
  return mph * KMH_PER_MPH;
}

/** Speed in the display unit, rounded to a whole number (never negative). */
export function displaySpeed(kmh: number, units: SpeedUnits): number {
  const v = units === 'mph' ? kmhToMph(kmh) : kmh;
  return Math.max(0, Math.round(Math.abs(v)));
}

export function unitLabel(units: SpeedUnits): string {
  return units === 'mph' ? 'MPH' : 'KM/H';
}

/** Whole milliseconds, truncated like a timing system (tolerant of float error). */
function toMillis(s: number): number {
  return Math.floor(Math.max(0, s) * 1000 + 1e-6);
}

/** Lap time as m:ss.mmm, e.g. 65.4321 -> "1:05.432". Null -> "-:--.---". */
export function formatLapTime(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return EMPTY_LAP;
  const ms = toMillis(s);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Sector time as ss.mmm under a minute (e.g. "41.208"), otherwise m:ss.mmm. */
export function formatSectorTime(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return EMPTY_SECTOR;
  if (s >= 60) return formatLapTime(s);
  const ms = toMillis(s);
  return `${Math.floor(ms / 1000)}.${String(ms % 1000).padStart(3, '0')}`;
}

/** Live delta with explicit sign and three decimals: +0.312 / -1.205. */
export function formatDelta(d: number | null): string {
  if (d === null || !Number.isFinite(d)) return EMPTY_DELTA;
  const clamped = Math.max(-99.999, Math.min(99.999, d));
  const abs = Math.abs(clamped).toFixed(3);
  if (abs === '0.000') return '+0.000';
  return `${clamped < 0 ? '-' : '+'}${abs}`;
}

/** Colour class for a delta: green when faster (negative), red when slower. */
export function deltaClass(d: number | null): DeltaClass {
  if (d === null || !Number.isFinite(d)) return 'none';
  if (Math.abs(d) < 0.0005) return 'even';
  return d < 0 ? 'faster' : 'slower';
}

/** -1 = R, 0 = N, 1..n. */
export function gearLabel(gear: number): string {
  if (gear < 0) return 'R';
  if (gear === 0) return 'N';
  return String(Math.round(gear));
}

/** Delta bar fill: -1..1 of the half-bar, linear within +-rangeS. */
export function deltaBarFraction(d: number | null, rangeS = 1.5): number {
  if (d === null || !Number.isFinite(d)) return 0;
  return Math.max(-1, Math.min(1, d / rangeS));
}
