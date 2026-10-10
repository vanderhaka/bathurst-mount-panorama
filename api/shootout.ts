import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  isPlausibleShootoutLap, isShootoutAttempt, isShootoutCar, isUuid, MAX_SHOOTOUT_ATTEMPTS,
  MAX_SHOOTOUT_LAP_S, MIN_SHOOTOUT_LAP_S, normalizeShootoutNickname,
  type LeaderboardEntry, type ShootoutAttempt,
} from '../src/shootout/model.js';

const MAX_BODY_BYTES = 8192;

interface ShootoutApiConfig {
  supabaseUrl?: string;
  serviceKey?: string;
  fetch?: typeof fetch;
}

class RpcError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function rpc(name: string, parameters: object, config: ShootoutApiConfig): Promise<unknown> {
  const supabaseUrl = config.supabaseUrl ?? process.env.SHOOTOUT_SUPABASE_URL;
  const serviceKey = config.serviceKey ?? process.env.SHOOTOUT_SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) throw new RpcError(503, 'The leaderboard is unavailable. Your result can be saved in this browser.');
  const response = await (config.fetch ?? fetch)(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify(parameters), signal: AbortSignal.timeout(8000),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'message' in data ? data.message : null;
    const errors: Record<string, [number, string]> = {
      shootout_quota_exhausted: [409, 'All three Shootout attempts have been used in this browser.'],
      shootout_number_used: [409, 'This attempt number has already been used in this browser.'],
      shootout_request_conflict: [409, 'This attempt was already allocated with different details.'],
      shootout_attempt_not_found: [404, 'This attempt was not allocated to this browser.'],
      shootout_result_conflict: [409, 'This attempt already has a published result.'],
      shootout_invalid_input: [422, 'The Shootout details are invalid.'],
    };
    const error = typeof message === 'string' ? errors[message] : undefined;
    throw new RpcError(error?.[0] ?? 503, error?.[1] ?? 'The leaderboard could not save this request. Please retry.');
  }
  return data;
}

function onlyRow(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : null;
}

function leaderboardEntry(value: unknown): LeaderboardEntry | null {
  if (typeof value !== 'object' || value === null || !('rank' in value) || typeof value.rank !== 'number' ||
    !Number.isInteger(value.rank) || value.rank < 1 || value.rank > 10 ||
    !('nickname' in value) || typeof value.nickname !== 'string' || normalizeShootoutNickname(value.nickname) !== value.nickname ||
    !('car' in value) || !isShootoutCar(value.car) || !('time_s' in value) || typeof value.time_s !== 'number' ||
    !Number.isFinite(value.time_s) || value.time_s < MIN_SHOOTOUT_LAP_S || value.time_s > MAX_SHOOTOUT_LAP_S) return null;
  return { rank: value.rank, nickname: value.nickname, car: value.car, timeS: value.time_s };
}

export async function handleShootoutRequest(request: Request, config: ShootoutApiConfig = {}): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Use GET or POST.' }, 405);
  try {
    if (request.method === 'GET') {
      const data = await rpc('shootout_leaderboard', {}, config);
      if (!Array.isArray(data) || data.length > 10) throw new RpcError(503, 'The leaderboard returned invalid results.');
      const entries: LeaderboardEntry[] = [];
      for (const row of data) {
        const entry = leaderboardEntry(row);
        if (!entry) throw new RpcError(503, 'The leaderboard returned invalid results.');
        entries.push(entry);
      }
      return json({ available: true, entries });
    }
    const origin = request.headers.get('Origin');
    if (origin !== null && origin !== new URL(request.url).origin) return json({ error: 'Use this website to enter the Shootout.' }, 403);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Send JSON Shootout details.' }, 415);
    if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return json({ error: 'The request is too large.' }, 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json({ error: 'The request is too large.' }, 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: 'The request is not valid JSON.' }, 400); }
    if (typeof body !== 'object' || body === null || !('format' in body) || body.format !== 'top10' ||
      !('browserToken' in body) || !isUuid(body.browserToken) || !('action' in body)) {
      return json({ error: 'The Shootout details are invalid.' }, 422);
    }
    const browserHash = createHash('sha256').update(body.browserToken.toLowerCase()).digest('hex');
    if (body.action === 'start') {
      if (!('requestId' in body) || !isUuid(body.requestId) || !('car' in body) || !isShootoutCar(body.car) ||
        !('number' in body) || typeof body.number !== 'number' || !Number.isInteger(body.number) || body.number < 1 || body.number > MAX_SHOOTOUT_ATTEMPTS) {
        return json({ error: 'Choose an eligible car and an available attempt.' }, 422);
      }
      const row = onlyRow(await rpc('shootout_start', { p_browser_hash: browserHash, p_attempt_id: body.requestId,
        p_attempt_number: body.number, p_car: body.car }, config));
      if (typeof row !== 'object' || row === null || !('id' in row) || !('number' in row) || !('car' in row) || !('started_at' in row)) {
        throw new RpcError(503, 'The leaderboard did not confirm this attempt.');
      }
      const attempt = { id: row.id, number: row.number, car: row.car, startedAt: row.started_at, online: true };
      if (!isShootoutAttempt(attempt) || attempt.id !== body.requestId.toLowerCase() || attempt.car !== body.car || attempt.number !== body.number) {
        throw new RpcError(503, 'The leaderboard did not confirm this attempt.');
      }
      return json({ attempt: attempt satisfies ShootoutAttempt });
    }
    if (body.action === 'submit') {
      const nickname = 'nickname' in body ? normalizeShootoutNickname(body.nickname) : null;
      if (!('attemptId' in body) || !isUuid(body.attemptId) || nickname === null || !('timeS' in body) ||
        !('sectorsS' in body) || !isPlausibleShootoutLap(body.timeS, body.sectorsS)) {
        return json({ error: 'Enter a nickname of 1 to 24 characters and a valid completed lap.' }, 422);
      }
      const row = onlyRow(await rpc('shootout_submit', { p_browser_hash: browserHash, p_attempt_id: body.attemptId,
        p_nickname: nickname, p_time_s: body.timeS, p_sectors_s: body.sectorsS }, config));
      if (typeof row !== 'object' || row === null || !('publication' in row) || row.publication !== 'published') {
        throw new RpcError(503, 'The leaderboard did not confirm publication.');
      }
      return json({ publication: 'published' });
    }
    return json({ error: 'Unknown Shootout action.' }, 422);
  } catch (error) {
    const status = error instanceof RpcError ? error.status : 503;
    const message = error instanceof RpcError ? error.message : 'The leaderboard is unavailable. Your result can be saved in this browser.';
    return request.method === 'GET' ? json({ available: false, entries: [], error: message }, status) : json({ error: message }, status);
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
        if (size > MAX_BODY_BYTES) {
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
