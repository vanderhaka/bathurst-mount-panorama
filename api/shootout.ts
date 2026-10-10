import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  currentSeason, isBoardCar, isPlausibleReplay, isPlausibleShootoutLap, isSeasonId, isShootoutAttempt, isShootoutCar, isUuid,
  MAX_REPLAY_CHARS, MAX_SHOOTOUT_ATTEMPTS, MAX_SHOOTOUT_LAP_S, MIN_SHOOTOUT_LAP_S, normalizeShootoutNickname, shootoutNicknameError,
  type BoardCar, type LeaderboardEntry, type ShootoutAttempt, type ShootoutSeason,
} from '../src/shootout/model.js';

const MAX_BODY_BYTES = 8192;
// Only a submit carries a replay.
const MAX_SUBMIT_BODY_BYTES = MAX_REPLAY_CHARS + MAX_BODY_BYTES;
const PUBLIC_CACHE = 'public, s-maxage=10, stale-while-revalidate=30';
const DOWN = 'The leaderboard is down right now. Your result is saved in this browser.';

interface ShootoutApiConfig {
  supabaseUrl?: string;
  serviceKey?: string;
  /** Salt for hashing client IPs (SHOOTOUT_IP_SALT; falls back to the service key). */
  ipSalt?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

class RpcError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200, cache = 'no-store'): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': status === 200 ? cache : 'no-store' } });
}

const RPC_ERRORS: Record<string, [number, string]> = {
  shootout_quota_exhausted: [409, 'No attempts left on this browser this week.'],
  shootout_number_used: [409, 'This attempt number is already used this week.'],
  shootout_request_conflict: [409, 'This attempt was already started with different details.'],
  shootout_attempt_not_found: [404, 'The leaderboard has no record of this attempt.'],
  shootout_result_conflict: [409, 'This attempt already has a different published result.'],
  shootout_invalid_input: [422, 'The Shootout details are invalid.'],
  shootout_nickname_rejected: [422, 'Choose a different nickname.'],
  shootout_wrong_week: [422, "This attempt is not in this week's Shootout. Check your device's date and time."],
  shootout_season_closed: [422, 'That Shootout week has closed.'],
  shootout_lap_unverified: [422, 'This lap could not be verified: the leaderboard did not see it start in time.'],
  shootout_rate_limited_hour: [429, 'Too many Shootout starts from your network. Try again in an hour.'],
  shootout_rate_limited_day: [429, 'Too many Shootout starts from your network today. Try again tomorrow.'],
};

function serviceKey(config: ShootoutApiConfig): string | undefined {
  return config.serviceKey ?? process.env.SHOOTOUT_SUPABASE_SERVICE_KEY;
}

async function rpc(name: string, parameters: object, config: ShootoutApiConfig): Promise<unknown> {
  const supabaseUrl = config.supabaseUrl ?? process.env.SHOOTOUT_SUPABASE_URL;
  const key = serviceKey(config);
  if (!supabaseUrl || !key) throw new RpcError(503, DOWN);
  const response = await (config.fetch ?? fetch)(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(parameters), signal: AbortSignal.timeout(8000),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data ? data.message : null;
    const error = typeof message === 'string' ? RPC_ERRORS[message] : undefined;
    throw new RpcError(error?.[0] ?? 503, error?.[1] ?? DOWN);
  }
  return data;
}

function onlyRow(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : null;
}

const isLapTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= MIN_SHOOTOUT_LAP_S && value <= MAX_SHOOTOUT_LAP_S;

function leaderboardEntry(value: unknown, car: BoardCar): LeaderboardEntry | null {
  if (typeof value !== 'object' || value === null || !('id' in value) || !isUuid(value.id) ||
    !('rank' in value) || typeof value.rank !== 'number' || !Number.isInteger(value.rank) || value.rank < 1 || value.rank > 10 ||
    !('nickname' in value) || typeof value.nickname !== 'string' || normalizeShootoutNickname(value.nickname) !== value.nickname ||
    !('car' in value) || !isShootoutCar(value.car) || car !== 'all' && value.car !== car ||
    !('time_s' in value) || !isLapTime(value.time_s)) return null;
  return { id: value.id, rank: value.rank, nickname: value.nickname, car: value.car, timeS: value.time_s };
}

/** The client address Vercel reports (x-real-ip, else the first x-forwarded-for hop), hashed with a server salt. */
function ipHash(request: Request, config: ShootoutApiConfig): string {
  const ip = request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const salt = config.ipSalt ?? (process.env.SHOOTOUT_IP_SALT || serviceKey(config) || 'bathurst-shootout');
  return createHash('sha256').update(`${salt}\n${ip}`).digest('hex');
}

async function board(season: ShootoutSeason, car: BoardCar, replay: string | null, config: ShootoutApiConfig): Promise<Response> {
  if (replay !== null) {
    if (!/^(10|[1-9])$/.test(replay)) return json({ error: 'Choose a place from 1 to 10.' }, 422);
    const rank = Number(replay);
    const data = await rpc('shootout_replay', { p_season: season.id, p_car: car, p_rank: rank }, config);
    if (Array.isArray(data) && data.length === 0) return json({ error: 'There is no replay for that place yet.' }, 404);
    const row = onlyRow(data);
    if (typeof row !== 'object' || row === null || !('car' in row) || !isShootoutCar(row.car) || car !== 'all' && row.car !== car ||
      !('time_s' in row) || !isLapTime(row.time_s) || !('replay' in row) || typeof row.replay !== 'string' || row.replay.length > MAX_REPLAY_CHARS) {
      throw new RpcError(503, 'The leaderboard sent an invalid replay.');
    }
    return json({ season, car: row.car, rank, timeS: row.time_s, replay: row.replay }, 200, PUBLIC_CACHE);
  }
  const data = await rpc('shootout_board', { p_season: season.id, p_car: car }, config);
  if (!Array.isArray(data) || data.length > 10) throw new RpcError(503, 'The leaderboard sent invalid results.');
  const entries: LeaderboardEntry[] = [];
  for (const row of data) {
    const entry = leaderboardEntry(row, car);
    if (!entry || entry.rank !== entries.length + 1) throw new RpcError(503, 'The leaderboard sent invalid results.');
    entries.push(entry);
  }
  return json({ available: true, season, car, entries }, 200, PUBLIC_CACHE);
}

export async function handleShootoutRequest(request: Request, config: ShootoutApiConfig = {}): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Use GET or POST.' }, 405);
  const season = currentSeason(config.now?.() ?? new Date());
  const params = new URL(request.url).searchParams;
  const car = params.get('car') ?? 'all';
  try {
    if (request.method === 'GET') {
      if (!isBoardCar(car)) return json({ available: false, season, car: 'all', entries: [], error: 'Choose all cars, camaro, mustang or supra.' }, 422);
      return await board(season, car, params.get('replay'), config);
    }
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== new URL(request.url).origin) return json({ error: 'Use this website to enter the Shootout.' }, 403);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send JSON Shootout details.' }, 415);
    if (Number(request.headers.get('Content-Length')) > MAX_SUBMIT_BODY_BYTES) return json({ error: 'The request is too large.' }, 413);
    const raw = await request.text();
    const bytes = Buffer.byteLength(raw);
    if (bytes > MAX_SUBMIT_BODY_BYTES) return json({ error: 'The request is too large.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: 'The request is not valid JSON.' }, 400); }
    if (typeof body === 'object' && body !== null && (!('action' in body) || body.action !== 'submit') && bytes > MAX_BODY_BYTES) {
      return json({ error: 'The request is too large.' }, 413);
    }
    if (typeof body !== 'object' || body === null || !('format' in body) || body.format !== 'top10' ||
      !('browserToken' in body) || !isUuid(body.browserToken) || !('action' in body)) {
      return json({ error: 'The Shootout details are invalid.' }, 422);
    }
    const browserHash = createHash('sha256').update(body.browserToken.toLowerCase()).digest('hex');
    if (body.action === 'start') {
      // Clients from before seasons send no season: they start in this one.
      const attemptSeason = 'season' in body ? body.season : season.id;
      if (!('requestId' in body) || !isUuid(body.requestId) || !('car' in body) || !isShootoutCar(body.car) || !isSeasonId(attemptSeason) ||
        !('number' in body) || typeof body.number !== 'number' || !Number.isInteger(body.number) || body.number < 1 || body.number > MAX_SHOOTOUT_ATTEMPTS) {
        return json({ error: 'Choose an eligible car and an available attempt.' }, 422);
      }
      const row = onlyRow(await rpc('shootout_start_attempt', { p_browser_hash: browserHash, p_ip_hash: ipHash(request, config),
        p_attempt_id: body.requestId, p_attempt_number: body.number, p_car: body.car, p_season: attemptSeason }, config));
      if (typeof row !== 'object' || row === null || !('id' in row) || !('number' in row) || !('car' in row) || !('started_at' in row) ||
        !('season' in row) || row.season !== attemptSeason) {
        throw new RpcError(503, 'The leaderboard did not confirm this attempt.');
      }
      const attempt = { id: row.id, number: row.number, car: row.car, startedAt: row.started_at, online: true };
      if (!isShootoutAttempt(attempt) || attempt.id !== body.requestId.toLowerCase() || attempt.car !== body.car || attempt.number !== body.number) {
        throw new RpcError(503, 'The leaderboard did not confirm this attempt.');
      }
      return json({ attempt: attempt satisfies ShootoutAttempt });
    }
    if (body.action === 'submit') {
      const nicknameInput = 'nickname' in body ? body.nickname : null;
      const nicknameError = shootoutNicknameError(nicknameInput);
      if (nicknameError) return json({ error: nicknameError }, 422);
      if (!('attemptId' in body) || !isUuid(body.attemptId)) return json({ error: 'The Shootout details are invalid.' }, 422);
      if (!('timeS' in body) || !('sectorsS' in body) || !isPlausibleShootoutLap(body.timeS, body.sectorsS)) {
        return json({ error: 'This lap is outside the Shootout limits.' }, 422);
      }
      const replay = 'replay' in body && body.replay !== null ? body.replay : null;
      if (replay !== null && (typeof replay !== 'string' || replay.length > MAX_REPLAY_CHARS || !isPlausibleReplay(replay, body.timeS))) {
        return json({ error: 'The lap replay does not match this lap.' }, 422);
      }
      const row = onlyRow(await rpc('shootout_submit_lap', { p_browser_hash: browserHash, p_attempt_id: body.attemptId,
        p_nickname: normalizeShootoutNickname(nicknameInput), p_time_s: body.timeS, p_sectors_s: body.sectorsS, p_replay: replay }, config));
      if (typeof row !== 'object' || row === null || !('publication' in row) || row.publication !== 'published' ||
        !('place' in row) || typeof row.place !== 'number' || !Number.isInteger(row.place) || row.place < 1 ||
        !('total' in row) || typeof row.total !== 'number' || !Number.isInteger(row.total) || row.total < row.place) {
        throw new RpcError(503, 'The leaderboard did not confirm your score.');
      }
      return json({ publication: 'published', rank: row.place, of: row.total });
    }
    return json({ error: 'Unknown Shootout action.' }, 422);
  } catch (error) {
    const status = error instanceof RpcError ? error.status : 503;
    const message = error instanceof RpcError ? error.message : DOWN;
    return request.method === 'GET' ? json({ available: false, season, car: isBoardCar(car) ? car : 'all', entries: [], error: message }, status)
      : json({ error: message }, status);
  }
}

export default async function shootout(request: IncomingMessage & { body?: unknown }, response: ServerResponse): Promise<void> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  const host = headers.get('host') ?? 'localhost';
  const protocol = headers.get('x-forwarded-proto') === 'http' || host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  let body: string | undefined;
  if (request.method === 'POST') {
    if (request.body !== undefined) body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    else {
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of request) {
        if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) continue;
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        size += bytes.length;
        if (size > MAX_SUBMIT_BODY_BYTES) {
          response.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ error: 'The request is too large.' }));
          return;
        }
        chunks.push(bytes);
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
  }
  const result = await handleShootoutRequest(new Request(`${protocol}://${host}${request.url ?? '/api/shootout'}`, {
    method: request.method, headers, body,
  }));
  response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
  response.end(await result.text());
}
