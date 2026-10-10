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
