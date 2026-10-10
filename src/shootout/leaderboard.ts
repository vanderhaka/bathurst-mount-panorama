import {
  type BoardCar, type LeaderboardResult, type ShootoutCar, type ShootoutRank, type ShootoutSeason,
  currentSeason, decodeReplay, isBoardCar, isSeasonId, isShootoutAttempt, isShootoutCar, isUuid,
  MAX_SHOOTOUT_LAP_S, MIN_SHOOTOUT_LAP_S, normalizeShootoutNickname,
  type LeaderboardEntry, type ShootoutAttempt,
} from './model';

export class ShootoutGatewayError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status = 0) {
    super(message);
    this.name = 'ShootoutGatewayError';
  }
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
// fetch rejects with a TypeError when the network fails; a timeout rejects with a DOMException instead.
const networkFailure = (error: unknown) => offline() || error instanceof TypeError;

async function post(body: object): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('/api/shootout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new ShootoutGatewayError(networkFailure(error)
      ? "You're offline. Your result is saved in this browser."
      : 'The leaderboard is not responding. Your result is saved in this browser.', true);
  }
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new ShootoutGatewayError('The leaderboard sent a bad reply. Your result is saved in this browser.', true);
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : 'The leaderboard could not save this attempt.';
    throw new ShootoutGatewayError(message, response.status >= 500 || response.status === 429, response.status);
  }
  return data;
}

/** Allocates the attempt on the server in its season (by default the season it started in). */
export async function startShootoutAttempt(browserToken: string, attempt: ShootoutAttempt,
  season = currentSeason(new Date(attempt.startedAt)).id): Promise<ShootoutAttempt> {
  const data = await post({ action: 'start', format: 'top10', browserToken, requestId: attempt.id, car: attempt.car, number: attempt.number, season });
  if (typeof data !== 'object' || data === null || !('attempt' in data) || !isShootoutAttempt(data.attempt) ||
    data.attempt.id !== attempt.id || data.attempt.number !== attempt.number || data.attempt.car !== attempt.car || !data.attempt.online) {
    throw new ShootoutGatewayError('The leaderboard sent a bad reply. Your result is saved in this browser.', true);
  }
  const { id, number, car, online, startedAt } = data.attempt;
  return { id, number, car, online, startedAt };
}

export function isShootoutRank(value: unknown): value is ShootoutRank {
  return typeof value === 'object' && value !== null &&
    'rank' in value && typeof value.rank === 'number' && Number.isInteger(value.rank) && value.rank >= 1 &&
    'of' in value && typeof value.of === 'number' && Number.isInteger(value.of) && value.of >= value.rank;
}

export async function publishShootoutAttempt(browserToken: string, saved: {
  attempt: ShootoutAttempt;
  nickname: string;
  timeS: number;
  sectorsS: number[];
  replay?: string | null;
}): Promise<ShootoutRank | null> {
  const data = await post({ action: 'submit', format: 'top10', browserToken, attemptId: saved.attempt.id,
    nickname: saved.nickname, timeS: saved.timeS, sectorsS: saved.sectorsS, ...saved.replay ? { replay: saved.replay } : {} });
  if (typeof data !== 'object' || data === null || !('publication' in data) || data.publication !== 'published') {
    throw new ShootoutGatewayError('The leaderboard did not confirm your score. Your result is saved in this browser.', true);
  }
  return isShootoutRank(data) ? { rank: data.rank, of: data.of } : null;
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return typeof value === 'object' && value !== null &&
    (!('id' in value) || isUuid(value.id)) &&
    'rank' in value && typeof value.rank === 'number' && Number.isInteger(value.rank) && value.rank >= 1 && value.rank <= 10 &&
    'nickname' in value && typeof value.nickname === 'string' && normalizeShootoutNickname(value.nickname) === value.nickname &&
    'car' in value && isShootoutCar(value.car) &&
    'timeS' in value && typeof value.timeS === 'number' && Number.isFinite(value.timeS) && value.timeS >= MIN_SHOOTOUT_LAP_S && value.timeS <= MAX_SHOOTOUT_LAP_S;
}

function isSeason(value: unknown): value is ShootoutSeason {
  return typeof value === 'object' && value !== null && 'id' in value && isSeasonId(value.id) &&
    'startsAt' in value && typeof value.startsAt === 'string' && Number.isFinite(Date.parse(value.startsAt)) &&
    'endsAt' in value && typeof value.endsAt === 'string' && Date.parse(value.endsAt) > Date.parse(value.startsAt);
}

async function getJson(query: string): Promise<{ ok: true; data: unknown } | { ok: false; unavailable: 'offline' | 'server' }> {
  if (offline()) return { ok: false, unavailable: 'offline' };
  try {
    const response = await fetch(`/api/shootout?${query}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const data: unknown = await response.json();
    return response.ok ? { ok: true, data } : { ok: false, unavailable: 'server' };
  } catch (error) {
    return { ok: false, unavailable: networkFailure(error) ? 'offline' : 'server' };
  }
}

/** Contract: the season board for one car or all cars. Never throws. */
export async function fetchBoard(car: BoardCar = 'all'): Promise<LeaderboardResult> {
  const board = isBoardCar(car) ? car : 'all';
  const failed = (unavailable: 'offline' | 'server'): LeaderboardResult => ({ available: false, season: currentSeason(), car: board, entries: [], unavailable });
  const result = await getJson(`car=${board}`);
  if (!result.ok) return failed(result.unavailable);
  const data = result.data;
  if (typeof data !== 'object' || data === null || !('available' in data) || data.available !== true ||
    'season' in data && !isSeason(data.season) || 'car' in data && data.car !== board ||
    !('entries' in data) || !Array.isArray(data.entries) || data.entries.length > 10 || !data.entries.every(isLeaderboardEntry) ||
    board !== 'all' && data.entries.some((entry: LeaderboardEntry) => entry.car !== board) ||
    data.entries.some((entry: LeaderboardEntry, index: number) => entry.rank !== index + 1)) {
    return failed('server');
  }
  const season = 'season' in data && isSeason(data.season) ? data.season : currentSeason();
  return { available: true, season: { id: season.id, startsAt: season.startsAt, endsAt: season.endsAt }, car: board,
    entries: data.entries.map(({ id, rank, nickname, car: entryCar, timeS }: LeaderboardEntry) => ({ ...id ? { id } : {}, rank, nickname, car: entryCar, timeS })) };
}

export async function fetchLeaderboard(): Promise<{ available: boolean; entries: LeaderboardEntry[] }> {
  const { available, entries } = await fetchBoard('all');
  return { available, entries };
}

/** Contract: the replay of the lap at this rank on this season's board, for the Arcade ghost. Null when unavailable. */
export async function fetchReplay(car: BoardCar, rank: number): Promise<{ car: ShootoutCar; timeS: number; frames: Float32Array } | null> {
  if (!isBoardCar(car) || !Number.isInteger(rank) || rank < 1 || rank > 10) return null;
  const result = await getJson(`car=${car}&replay=${rank}`);
  if (!result.ok) return null;
  const data = result.data;
  if (typeof data !== 'object' || data === null || !('car' in data) || !isShootoutCar(data.car) || car !== 'all' && data.car !== car ||
    !('timeS' in data) || typeof data.timeS !== 'number' || !Number.isFinite(data.timeS) ||
    !('replay' in data) || typeof data.replay !== 'string') return null;
  const frames = decodeReplay(data.replay);
  return frames ? { car: data.car, timeS: data.timeS, frames } : null;
}
