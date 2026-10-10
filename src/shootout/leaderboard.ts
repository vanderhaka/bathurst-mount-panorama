import {
  type BoardCar, type LeaderboardResult, type ShootoutCar,
  isShootoutAttempt, isShootoutCar, MAX_SHOOTOUT_LAP_S, MIN_SHOOTOUT_LAP_S, normalizeShootoutNickname,
  type LeaderboardEntry, type ShootoutAttempt,
} from './model';

export class ShootoutGatewayError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'ShootoutGatewayError';
  }
}

async function post(body: object): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('/api/shootout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ShootoutGatewayError('The leaderboard is unavailable. Your result is saved in this browser.', true);
  }
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new ShootoutGatewayError('The leaderboard returned an unreadable response.', true);
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error : 'The leaderboard could not save this attempt.';
    throw new ShootoutGatewayError(message, response.status >= 500 || response.status === 429);
  }
  return data;
}

export async function startShootoutAttempt(browserToken: string, attempt: ShootoutAttempt): Promise<ShootoutAttempt> {
  const data = await post({ action: 'start', format: 'top10', browserToken, requestId: attempt.id, car: attempt.car, number: attempt.number });
  if (typeof data !== 'object' || data === null || !('attempt' in data) || !isShootoutAttempt(data.attempt) ||
    data.attempt.id !== attempt.id || data.attempt.number !== attempt.number || data.attempt.car !== attempt.car || !data.attempt.online) {
    throw new ShootoutGatewayError('The leaderboard returned an invalid attempt.', true);
  }
  return data.attempt;
}

export async function publishShootoutAttempt(browserToken: string, saved: {
  attempt: ShootoutAttempt;
  nickname: string;
  timeS: number;
  sectorsS: number[];
}): Promise<void> {
  const data = await post({ action: 'submit', format: 'top10', browserToken, attemptId: saved.attempt.id,
    nickname: saved.nickname, timeS: saved.timeS, sectorsS: saved.sectorsS });
  if (typeof data !== 'object' || data === null || !('publication' in data) || data.publication !== 'published') {
    throw new ShootoutGatewayError('The leaderboard did not confirm publication.', true);
  }
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return typeof value === 'object' && value !== null &&
    'rank' in value && typeof value.rank === 'number' && Number.isInteger(value.rank) && value.rank >= 1 && value.rank <= 10 &&
    'nickname' in value && typeof value.nickname === 'string' && normalizeShootoutNickname(value.nickname) === value.nickname &&
    'car' in value && isShootoutCar(value.car) &&
    'timeS' in value && typeof value.timeS === 'number' && Number.isFinite(value.timeS) && value.timeS >= MIN_SHOOTOUT_LAP_S && value.timeS <= MAX_SHOOTOUT_LAP_S;
}

export async function fetchLeaderboard(): Promise<{ available: boolean; entries: LeaderboardEntry[] }> {
  try {
    const response = await fetch('/api/shootout', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    const data: unknown = await response.json();
    if (!response.ok || typeof data !== 'object' || data === null || !('available' in data) || data.available !== true ||
      !('entries' in data) || !Array.isArray(data.entries) || data.entries.length > 10 || !data.entries.every(isLeaderboardEntry)) {
      return { available: false, entries: [] };
    }
    return { available: true, entries: data.entries };
  } catch {
    return { available: false, entries: [] };
  }
}

/** Contract: the season board for one car or all cars. Never throws. */
export async function fetchBoard(car: BoardCar = 'all'): Promise<LeaderboardResult> {
  void car;
  throw new Error('fetchBoard: not implemented yet');
}

/** Contract: the replay of the lap at this rank on this season's board, for the Arcade ghost. Null when unavailable. */
export async function fetchReplay(car: BoardCar, rank: number): Promise<{ car: ShootoutCar; timeS: number; frames: Float32Array } | null> {
  void car; void rank;
  throw new Error('fetchReplay: not implemented yet');
}
