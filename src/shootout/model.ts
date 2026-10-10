export const SHOOTOUT_CARS = ['camaro', 'mustang', 'supra'] as const;
export const MAX_SHOOTOUT_ATTEMPTS = 3;
export const MAX_SHOOTOUT_NICKNAME_LENGTH = 24;
export const MIN_SHOOTOUT_LAP_S = 100;
export const MAX_SHOOTOUT_LAP_S = 600;

export type ShootoutCar = typeof SHOOTOUT_CARS[number];

export interface ShootoutAttempt {
  id: string;
  number: number;
  car: ShootoutCar;
  online: boolean;
  startedAt: string;
}

export type ShootoutOutcome =
  | { kind: 'valid'; timeS: number; sectorsS: number[] }
  | { kind: 'invalid'; timeS: number | null; reason: string };

export interface SavedShootoutAttempt {
  attempt: ShootoutAttempt;
  outcome: ShootoutOutcome | null;
  nickname: string | null;
  publication: 'pending' | 'published' | 'skipped';
}

export interface LeaderboardEntry {
  /** The attempt id, so a browser can highlight its own row. */
  id?: string;
  rank: number;
  nickname: string;
  car: ShootoutCar;
  timeS: number;
}

export function isShootoutCar(value: unknown): value is ShootoutCar {
  return value === 'camaro' || value === 'mustang' || value === 'supra';
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeShootoutNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const nickname = value.trim();
  if (!nickname || [...nickname].length > MAX_SHOOTOUT_NICKNAME_LENGTH || /[\u0000-\u001f\u007f]/.test(nickname)) return null;
  return nickname;
}

export function isShootoutAttempt(value: unknown): value is ShootoutAttempt {
  return typeof value === 'object' && value !== null &&
    'id' in value && isUuid(value.id) &&
    'number' in value && typeof value.number === 'number' && Number.isInteger(value.number) && value.number >= 1 && value.number <= MAX_SHOOTOUT_ATTEMPTS &&
    'car' in value && isShootoutCar(value.car) &&
    'online' in value && typeof value.online === 'boolean' &&
    'startedAt' in value && typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt));
}

export function isPlausibleShootoutLap(timeS: unknown, sectorsS: unknown): timeS is number {
  return typeof timeS === 'number' && Number.isFinite(timeS) && timeS >= MIN_SHOOTOUT_LAP_S && timeS <= MAX_SHOOTOUT_LAP_S &&
    Array.isArray(sectorsS) && sectorsS.length === 3 && sectorsS.every((sector: unknown) => typeof sector === 'number' && Number.isFinite(sector) && sector > 0 && sector < timeS) &&
    Math.abs(sectorsS.reduce((sum: number, sector: number) => sum + sector, 0) - timeS) <= 1;
}

export function isShootoutOutcome(value: unknown): value is ShootoutOutcome {
  if (typeof value !== 'object' || value === null || !('kind' in value) || !('timeS' in value)) return false;
  if (value.kind === 'valid') return 'sectorsS' in value && isPlausibleShootoutLap(value.timeS, value.sectorsS);
  return value.kind === 'invalid' && (value.timeS === null || typeof value.timeS === 'number' && Number.isFinite(value.timeS) && value.timeS >= 0) &&
    'reason' in value && typeof value.reason === 'string' && value.reason.length > 0 && value.reason.length <= 200;
}

// ---- Contract for the Shootout overhaul (seasons, per-car boards, rank, replays). Implementations land in this
// module, leaderboard.ts and store.ts; the game and menus code against these signatures.

/** A board for one eligible car, or every car together. */
export type BoardCar = ShootoutCar | 'all';

/** Weekly season: Monday 00:00 to the next Monday 00:00, Australia/Sydney time. Attempts and boards are per season. */
export interface ShootoutSeason {
  /** e.g. '2026-10-12' (the Sydney date the season starts). */
  id: string;
  startsAt: string;
  endsAt: string;
}

/** Where a published lap placed in its season's board for all cars. */
export interface ShootoutRank {
  rank: number;
  of: number;
}

export interface LeaderboardResult {
  available: boolean;
  season: ShootoutSeason;
  car: BoardCar;
  entries: LeaderboardEntry[];
  /** Why the board is unavailable: no network on this device, or the server failed. */
  unavailable?: 'offline' | 'server';
}

/** Replays travel at this rate (Hz), quantised; decodeReplay returns ghost frames at GHOST_RATE. */
export const REPLAY_RATE = 10;

export function currentSeason(now: Date = new Date()): ShootoutSeason {
  void now;
  throw new Error('currentSeason: not implemented yet');
}

/** Ghost frames (src/race/ghost.ts layout: stride 8 at GHOST_RATE) to a compact string for upload. */
export function encodeReplay(frames: Float32Array): string {
  void frames;
  throw new Error('encodeReplay: not implemented yet');
}

/** Back to ghost frames (stride 8 at GHOST_RATE; pitch, roll and steer 0, speed from motion); null when malformed. */
export function decodeReplay(encoded: string): Float32Array | null {
  void encoded;
  throw new Error('decodeReplay: not implemented yet');
}
