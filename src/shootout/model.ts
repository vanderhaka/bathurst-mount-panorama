export const SHOOTOUT_CARS = ['camaro', 'mustang', 'supra'] as const;
export const MAX_SHOOTOUT_ATTEMPTS = 3;
export const MAX_SHOOTOUT_NICKNAME_LENGTH = 24;
/** About 97 % of the fastest ideal lap, rounded down: computeSpeedProfile at full grip with DEFAULT_HANDLING gives
 * 116.49 s for the Mustang and Supra (48.30, 30.51 and 37.69 s sectors) and 116.63 s for the Camaro.
 * tests/shootout-floors.test.ts recomputes it; supabase/migrations mirrors it. */
export const MIN_SHOOTOUT_LAP_S = 112;
export const MIN_SHOOTOUT_SECTORS_S: readonly number[] = [46, 29, 36];
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

// Kept short and mirrored in SQL (shootout_nickname_blocked). Parts match inside a word, words match whole.
export const BLOCKED_NICKNAME_PARTS: readonly string[] = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'bitch', 'whore', 'wank', 'twat', 'slut'];
export const BLOCKED_NICKNAME_WORDS: readonly string[] = ['fag', 'fags', 'ass', 'arse', 'dick', 'cock', 'coon', 'spic', 'chink', 'gook', 'kike', 'paki', 'wog', 'abo', 'boong', 'tranny', 'nazi'];
const LEET_FROM = '013457@$!|';
const LEET_TO = 'oieastasii';

/** ASCII-only folding (lower case, common leetspeak), so the SQL mirror with translate() matches exactly. */
export function isBlockedShootoutNickname(nickname: string): boolean {
  const folded = nickname.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/[013457@$!|]/g, (c) => LEET_TO[LEET_FROM.indexOf(c)]);
  return folded.split(/ +/).some((token) => {
    const word = token.replace(/[^a-z]/g, '');
    return word !== '' && (BLOCKED_NICKNAME_WORDS.includes(word) || BLOCKED_NICKNAME_PARTS.some((part) => word.includes(part)));
  });
}

/** Why a nickname cannot be published, or null. The API and the database apply the same rules. */
export function shootoutNicknameError(value: unknown): string | null {
  if (typeof value !== 'string') return 'Enter a nickname.';
  const nickname = value.normalize('NFKC').trim();
  if (!nickname) return 'Enter a nickname.';
  if ([...nickname].length > MAX_SHOOTOUT_NICKNAME_LENGTH) return `Use a nickname of ${MAX_SHOOTOUT_NICKNAME_LENGTH} characters or fewer.`;
  // \p{C}: controls, format characters (bidi overrides, zero-width), private use, surrogates and unassigned.
  if (/[\p{C}\u2028\u2029]/u.test(nickname) || nickname.normalize('NFKC') !== nickname) return 'Use a nickname without hidden or control characters.';
  if (isBlockedShootoutNickname(nickname)) return 'Choose a different nickname.';
  return null;
}

export function normalizeShootoutNickname(value: unknown): string | null {
  return typeof value === 'string' && shootoutNicknameError(value) === null ? value.normalize('NFKC').trim() : null;
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
    Array.isArray(sectorsS) && sectorsS.length === 3 && sectorsS.every((sector: unknown, index: number) => typeof sector === 'number' && Number.isFinite(sector) &&
      sector >= MIN_SHOOTOUT_SECTORS_S[index] && sector < timeS) &&
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
/** GHOST_RATE of src/race/ghost.ts, repeated because the API bundles this module without the game sources. */
export const REPLAY_FRAME_RATE = 30;
/** Largest replay the API accepts (characters of base64). */
export const MAX_REPLAY_CHARS = 48 * 1024;
/** No replay step may be faster than this (m/s); the fastest car tops out near 82 m/s. */
export const MAX_REPLAY_SPEED_MS = 100;

export function isBoardCar(value: unknown): value is BoardCar {
  return value === 'all' || isShootoutCar(value);
}

export function isSeasonId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().startsWith(value) && day.getUTCDay() === 1;
}

const DAY_MS = 86_400_000;
let sydneyClock: Intl.DateTimeFormat | null = null;

/** Sydney's wall clock at this instant, read as if it were UTC. */
function sydneyWallMs(ms: number): number {
  sydneyClock ??= new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const part: Record<string, number> = {};
  for (const { type, value } of sydneyClock.formatToParts(ms)) part[type] = Number(value);
  return Date.UTC(part.year, part.month - 1, part.day, part.hour % 24, part.minute, part.second);
}

/** The instant of 00:00 Sydney time on a calendar day (given as its UTC midnight). Sydney's DST changes happen at
 * 2-3 am on Sundays, so a Monday midnight always exists exactly once; two passes settle the offset. */
function sydneyMidnight(dayMs: number): number {
  let instant = dayMs - 10 * 3_600_000;
  for (let pass = 0; pass < 2; pass++) instant = dayMs - (sydneyWallMs(instant) - instant);
  return instant;
}

export function currentSeason(now: Date = new Date()): ShootoutSeason {
  const day = Math.floor(sydneyWallMs(now.getTime()) / DAY_MS) * DAY_MS;
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
  return { id: new Date(monday).toISOString().slice(0, 10),
    startsAt: new Date(sydneyMidnight(monday)).toISOString(), endsAt: new Date(sydneyMidnight(monday + 7 * DAY_MS)).toISOString() };
}

// Replay format (base64): a version byte, then unsigned LEB128 varints: the ghost frame count, and for every third
// frame (plus the last) the zigzag deltas of x, y, z in 5 cm steps and of the heading in 1/65536 turns. A 10 Hz step
// takes one or two bytes per value (a reset jump takes up to five), so a two-minute lap is about 11 KB.
const REPLAY_VERSION = 1;
const STRIDE = 8;
const POSITION_STEP_M = 0.05;
const HEADING_STEPS = 65_536;
const SUBSAMPLE = REPLAY_FRAME_RATE / REPLAY_RATE;
const MAX_REPLAY_FRAMES = (MAX_SHOOTOUT_LAP_S + 10) * REPLAY_FRAME_RATE;
const TAU = Math.PI * 2;

function pushVarint(bytes: number[], value: number): void {
  while (value >= 128) { bytes.push(value % 128 + 128); value = Math.floor(value / 128); }
  bytes.push(value);
}

const zigzag = (value: number) => value >= 0 ? value * 2 : -value * 2 - 1;
const unzigzag = (value: number) => value % 2 === 0 ? value / 2 : -(value + 1) / 2;
const quantise = (metres: number) => Number.isFinite(metres) ? Math.max(-(2 ** 30), Math.min(2 ** 30, Math.round(metres / POSITION_STEP_M))) : 0;
const headingSteps = (heading: number) => Number.isFinite(heading) ? Math.round((((heading % TAU) + TAU) % TAU) / TAU * HEADING_STEPS) % HEADING_STEPS : 0;
const wrapAngle = (angle: number) => angle - TAU * Math.round(angle / TAU);

export function encodeReplay(frames: Float32Array): string {
  const count = Math.floor(frames.length / STRIDE);
  const bytes: number[] = [REPLAY_VERSION];
  pushVarint(bytes, count);
  let x = 0, y = 0, z = 0, heading = 0;
  for (let k = 0; count > 0; k++) {
    const frame = Math.min(k * SUBSAMPLE, count - 1), o = frame * STRIDE;
    const nx = quantise(frames[o]), ny = quantise(frames[o + 1]), nz = quantise(frames[o + 2]), nh = headingSteps(frames[o + 3]);
    pushVarint(bytes, zigzag(nx - x));
    pushVarint(bytes, zigzag(ny - y));
    pushVarint(bytes, zigzag(nz - z));
    pushVarint(bytes, zigzag((nh - heading + HEADING_STEPS * 1.5) % HEADING_STEPS - HEADING_STEPS / 2));
    x = nx; y = ny; z = nz; heading = nh;
    if (frame === count - 1) break;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return btoa(binary);
}

export function decodeReplay(encoded: string): Float32Array | null {
  if (typeof encoded !== 'string' || encoded.length > MAX_REPLAY_CHARS || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  let binary: string;
  try { binary = atob(encoded); } catch { return null; }
  let at = 0;
  const read = (): number | null => {
    let value = 0, scale = 1;
    for (let i = 0; i < 6 && at < binary.length; i++) {
      const byte = binary.charCodeAt(at++);
      value += (byte % 128) * scale;
      if (byte < 128) return value;
      scale *= 128;
    }
    return null;
  };
  if (binary.charCodeAt(at++) !== REPLAY_VERSION) return null;
  const count = read();
  if (count === null || count < 1 || count > MAX_REPLAY_FRAMES) return null;
  const samples = Math.ceil((count - 1) / SUBSAMPLE) + 1;
  const pose = new Float64Array(samples * 4);
  let x = 0, y = 0, z = 0, heading = 0;
  for (let k = 0; k < samples; k++) {
    const dx = read(), dy = read(), dz = read(), dh = read();
    if (dx === null || dy === null || dz === null || dh === null) return null;
    x += unzigzag(dx); y += unzigzag(dy); z += unzigzag(dz);
    heading = ((heading + unzigzag(dh)) % HEADING_STEPS + HEADING_STEPS) % HEADING_STEPS;
    pose.set([x * POSITION_STEP_M, y * POSITION_STEP_M, z * POSITION_STEP_M, wrapAngle(heading / HEADING_STEPS * TAU)], k * 4);
  }
  if (at !== binary.length) return null;
  const frames = new Float32Array(count * STRIDE);
  const frameOf = (k: number) => Math.min(k * SUBSAMPLE, count - 1);
  // Speed of the sample step k -> k + 1, from the motion between them.
  const speedOf = (k: number) => k + 1 >= samples ? 0
    : Math.hypot(pose[k * 4 + 4] - pose[k * 4], pose[k * 4 + 5] - pose[k * 4 + 1], pose[k * 4 + 6] - pose[k * 4 + 2]) /
      ((frameOf(k + 1) - frameOf(k)) / REPLAY_FRAME_RATE);
  for (let i = 0; i < count; i++) {
    const k = Math.min(Math.floor(i / SUBSAMPLE), samples - 1), next = Math.min(k + 1, samples - 1);
    const span = frameOf(next) - frameOf(k), f = span > 0 ? (i - frameOf(k)) / span : 0;
    const a = k * 4, b = next * 4, o = i * STRIDE;
    frames[o] = pose[a] + (pose[b] - pose[a]) * f;
    frames[o + 1] = pose[a + 1] + (pose[b + 1] - pose[a + 1]) * f;
    frames[o + 2] = pose[a + 2] + (pose[b + 2] - pose[a + 2]) * f;
    frames[o + 3] = wrapAngle(pose[a + 3] + wrapAngle(pose[b + 3] - pose[a + 3]) * f);
    frames[o + 7] = speedOf(next > k ? k : Math.max(0, k - 1));
  }
  return frames;
}

/** A replay the API stores with a lap: it decodes, lasts the lap time (within 1 s) and never moves faster than
 * MAX_REPLAY_SPEED_MS between samples. */
export function isPlausibleReplay(encoded: unknown, timeS: number): boolean {
  const frames = typeof encoded === 'string' ? decodeReplay(encoded) : null;
  if (!frames || frames.length < STRIDE * 2) return false;
  if (Math.abs((frames.length / STRIDE - 1) / REPLAY_FRAME_RATE - timeS) > 1) return false;
  for (let o = 7; o < frames.length; o += STRIDE) if (!(frames[o] <= MAX_REPLAY_SPEED_MS)) return false;
  return true;
}

