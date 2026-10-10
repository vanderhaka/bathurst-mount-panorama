import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import shootout, { handleShootoutRequest } from '../api/shootout';
import { encodeReplay, MAX_REPLAY_CHARS, REPLAY_FRAME_RATE } from '../src/shootout/model';

const url = 'https://bathurst.example/api/shootout';
const browserToken = randomUUID();
const requestId = randomUUID();
const season = { id: '2026-10-05', startsAt: '2026-10-04T13:00:00.000Z', endsAt: '2026-10-11T13:00:00.000Z' };
let rpcFetch: ReturnType<typeof vi.fn<typeof fetch>>;

const start = () => ({ action: 'start', format: 'top10', browserToken, requestId, car: 'camaro', number: 1, season: season.id });
const submit = () => ({ action: 'submit', format: 'top10', browserToken, attemptId: requestId, nickname: ' James ', timeS: 124, sectorsS: [50, 38, 36] });
const started = () => [{ id: requestId, number: 1, car: 'camaro', started_at: '2026-10-10T00:00:00.000Z', season: season.id }];
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
function config() {
  return { supabaseUrl: 'https://database.example', serviceKey: 'test-service-key', ipSalt: 'salt', fetch: rpcFetch, now: () => new Date('2026-10-10T09:00:00Z') };
}
function sent(call = 0): unknown { return JSON.parse(String(rpcFetch.mock.calls[call][1]?.body)); }
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Ghost frames of a lap driven at a steady speed, encoded for upload. */
function replay(seconds: number, speed = 52): string {
  const count = Math.round(seconds * REPLAY_FRAME_RATE) + 1;
  const frames = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const angle = (i / REPLAY_FRAME_RATE) * speed / 1000;
    frames.set([1000 * Math.cos(angle), 10, 1000 * Math.sin(angle), angle, 0, 0, 0, speed], i * 8);
  }
  return encodeReplay(frames);
}

beforeEach(() => {
  vi.stubEnv('SHOOTOUT_SUPABASE_URL', '');
  vi.stubEnv('SHOOTOUT_SUPABASE_SERVICE_KEY', '');
  vi.stubEnv('SHOOTOUT_IP_SALT', '');
  rpcFetch = vi.fn<typeof fetch>();
});
afterEach(() => vi.unstubAllEnvs());

describe('Shootout API validation', () => {
  it.each([
    { ...start(), car: 'torana' }, { ...start(), number: 0 }, { ...start(), number: 4 },
    { ...start(), number: 1.5 }, { ...start(), browserToken: 'anonymous' }, { ...start(), requestId: 'wrong' },
    { ...start(), season: '2026-10-06' }, { ...start(), season: 20261005 },
    { ...start(), action: 'arcade' },
    { ...start(), format: 'arcade' },
  ])('does not allocate a rejected start %#', async (body) => {
    const response = await handleShootoutRequest(post(body), config());
    expect(response.status).toBe(422);
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...submit(), nickname: '' }, 'Enter a nickname.'], [{ ...submit(), nickname: ' '.repeat(3) }, 'Enter a nickname.'],
    [{ ...submit(), nickname: 'x'.repeat(25) }, '24 characters'], [{ ...submit(), nickname: 'James\nFake' }, 'hidden'],
    [{ ...submit(), nickname: 'Ja‮mes' }, 'hidden'], [{ ...submit(), nickname: 'Ja​mes' }, 'hidden'],
    [{ ...submit(), nickname: 'Sh1t Driver' }, 'different'],
    [{ ...submit(), timeS: 111.9, sectorsS: [46, 29, 36.9] }, 'limits'], [{ ...submit(), timeS: 601, sectorsS: [200, 200, 201] }, 'limits'],
    [{ ...submit(), timeS: Infinity }, 'limits'], [{ ...submit(), sectorsS: [45.9, 40, 38.1] }, 'limits'],
    [{ ...submit(), sectorsS: [50, 28.9, 45.1] }, 'limits'], [{ ...submit(), sectorsS: [50, 40, 34] }, 'limits'],
    [{ ...submit(), sectorsS: [50, 74] }, 'limits'], [{ ...submit(), sectorsS: [50, null, 74] }, 'limits'],
    [{ ...submit(), attemptId: 'not-allocated' }, 'invalid'],
    [{ ...submit(), replay: 'not base64!' }, 'replay'], [{ ...submit(), replay: 42 }, 'replay'],
    [{ ...submit(), replay: replay(122) }, 'replay'], [{ ...submit(), replay: replay(124, 101) }, 'replay'],
  ])('rejects an invalid result before sending any database request %#', async (body, message) => {
    const response = await handleShootoutRequest(post(body), config());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: expect.stringContaining(message) });
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  it('rejects cross-origin, non-JSON, oversized, and malformed requests without allocating', async () => {
    expect((await handleShootoutRequest(post(start(), { Origin: 'https://elsewhere.example' }), config())).status).toBe(403);
    expect((await handleShootoutRequest(new Request(url, { method: 'POST', body: '{}' }), config())).status).toBe(415);
    expect((await handleShootoutRequest(post({ ...start(), junk: 'x'.repeat(9000) }), config())).status).toBe(413);
    expect((await handleShootoutRequest(post({ ...submit(), replay: 'A'.repeat(MAX_REPLAY_CHARS + 9000) }), config())).status).toBe(413);
    expect((await handleShootoutRequest(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }), config())).status).toBe(400);
    expect(rpcFetch).not.toHaveBeenCalled();
  });
});

describe('Shootout API gateway', () => {
  it('hashes the browser token and client IP and returns only the allocated attempt', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json(started()));
    const response = await handleShootoutRequest(post(start(), { Origin: 'https://bathurst.example', 'x-real-ip': '203.0.113.7' }), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attempt: { id: requestId, number: 1, car: 'camaro', online: true, startedAt: '2026-10-10T00:00:00.000Z' } });
    expect(rpcFetch.mock.calls[0][0]).toBe('https://database.example/rest/v1/rpc/shootout_start_attempt');
    expect(sent()).toEqual({ p_browser_hash: sha(browserToken), p_ip_hash: sha('salt\n203.0.113.7'), p_attempt_id: requestId,
      p_attempt_number: 1, p_car: 'camaro', p_season: season.id });
    expect(JSON.stringify(sent())).not.toContain(browserToken);
    expect(JSON.stringify(sent())).not.toContain('203.0.113.7');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('uses the first forwarded address, and this season for clients that send none', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json(started()));
    const { season: _omitted, ...legacy } = start();
    void _omitted;
    expect((await handleShootoutRequest(post(legacy, { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }), config())).status).toBe(200);
    expect(sent()).toMatchObject({ p_ip_hash: sha('salt\n198.51.100.4'), p_season: season.id });
  });

  it('salts the IP hash from the environment, or the service key', async () => {
    rpcFetch.mockResolvedValue(Response.json(started()));
    const { ipSalt: _salt, ...unsalted } = config();
    void _salt;
    vi.stubEnv('SHOOTOUT_IP_SALT', 'env-salt');
    await handleShootoutRequest(post(start(), { 'x-real-ip': '203.0.113.7' }), unsalted);
    vi.stubEnv('SHOOTOUT_IP_SALT', '');
    rpcFetch.mockResolvedValue(Response.json(started()));
    await handleShootoutRequest(post(start(), { 'x-real-ip': '203.0.113.7' }), unsalted);
    expect(sent(0)).toMatchObject({ p_ip_hash: sha('env-salt\n203.0.113.7') });
    expect(sent(1)).toMatchObject({ p_ip_hash: sha('test-service-key\n203.0.113.7') });
  });

  it('does not confirm an attempt allocated in another season', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ ...started()[0], season: '2026-09-28' }]));
    expect((await handleShootoutRequest(post(start()), config())).status).toBe(503);
  });

  it('normalizes a nickname, uploads the replay and returns the rank', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ publication: 'published', place: 4, total: 37 }]));
    const lapReplay = replay(124);
    expect(lapReplay.length).toBeGreaterThan(8192);
    const response = await handleShootoutRequest(post({ ...submit(), nickname: ' Ｊames ', replay: lapReplay }), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publication: 'published', rank: 4, of: 37 });
    expect(sent()).toEqual({ p_browser_hash: sha(browserToken), p_attempt_id: requestId, p_nickname: 'James', p_time_s: 124,
      p_sectors_s: [50, 38, 36], p_replay: lapReplay });
  });

  it('submits without a replay', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ publication: 'published', place: 1, total: 1 }]));
    expect((await handleShootoutRequest(post(submit()), config())).status).toBe(200);
    expect(sent()).toMatchObject({ p_replay: null });
  });

  it.each([
    ['shootout_quota_exhausted', 409, 'No attempts left'], ['shootout_request_conflict', 409, 'different details'],
    ['shootout_result_conflict', 409, 'different published result'], ['shootout_attempt_not_found', 404, 'no record'],
    ['shootout_lap_unverified', 422, 'did not see it start in time'], ['shootout_season_closed', 422, 'week has closed'],
    ['shootout_wrong_week', 422, 'date and time'], ['shootout_nickname_rejected', 422, 'different nickname'],
    ['shootout_rate_limited_hour', 429, 'Try again in an hour'], ['shootout_rate_limited_day', 429, 'Try again tomorrow'],
  ])('returns a short, plain rejection for %s', async (message, expectedStatus, copy) => {
    rpcFetch.mockResolvedValueOnce(Response.json({ code: 'P0001', message }, { status: 400 }));
    const response = await handleShootoutRequest(post(message.includes('rate') ? start() : submit()), config());
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ error: expect.stringContaining(copy) });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not claim allocation or publication after a corrupt provider response', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ ...started()[0], car: 'torana' }]));
    expect((await handleShootoutRequest(post(start()), config())).status).toBe(503);
    rpcFetch.mockResolvedValueOnce(Response.json([{ publication: 'pending' }]));
    expect((await handleShootoutRequest(post(submit()), config())).status).toBe(503);
    rpcFetch.mockResolvedValueOnce(Response.json([{ publication: 'published', place: 5, total: 4 }]));
    expect((await handleShootoutRequest(post(submit()), config())).status).toBe(503);
  });

  it('hides provider diagnostics and server configuration from public responses', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json({ message: 'Private provider diagnostics test-service-key' }, { status: 500 }));
    const response = await handleShootoutRequest(post(start()), config());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/diagnostics|test-service-key|database\.example/);
  });
});

describe('Shootout API boards', () => {
  const row = (rank: number, car = 'supra') => ({ rank, id: randomUUID(), nickname: 'James', car, time_s: 123 + rank, browser_hash: 'private' });

  it('serves this season\'s Top 10 with attempt ids, without browser identifiers, cached briefly', async () => {
    const first = row(1);
    rpcFetch.mockResolvedValueOnce(Response.json([first]));
    const response = await handleShootoutRequest(new Request(url), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, season, car: 'all',
      entries: [{ id: first.id, rank: 1, nickname: 'James', car: 'supra', timeS: 124 }] });
    expect(rpcFetch.mock.calls[0][0]).toBe('https://database.example/rest/v1/rpc/shootout_board');
    expect(sent()).toEqual({ p_season: season.id, p_car: 'all' });
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=10, stale-while-revalidate=30');
  });

  it('serves a board per car and refuses rows from another car', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([row(1, 'mustang'), row(2, 'mustang')]));
    const response = await handleShootoutRequest(new Request(`${url}?car=mustang`), config());
    expect(await response.json()).toMatchObject({ available: true, car: 'mustang', entries: [{ rank: 1 }, { rank: 2 }] });
    expect(sent()).toEqual({ p_season: season.id, p_car: 'mustang' });
    rpcFetch.mockResolvedValueOnce(Response.json([row(1, 'supra')]));
    expect((await handleShootoutRequest(new Request(`${url}?car=mustang`), config())).status).toBe(503);
    expect((await handleShootoutRequest(new Request(`${url}?car=torana`), config())).status).toBe(422);
    expect(rpcFetch).toHaveBeenCalledTimes(2);
  });

  it('serves the replay of a board entry', async () => {
    const lapReplay = replay(124);
    rpcFetch.mockResolvedValueOnce(Response.json([{ car: 'camaro', time_s: 124, replay: lapReplay }]));
    const response = await handleShootoutRequest(new Request(`${url}?car=all&replay=3`), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ season, car: 'camaro', rank: 3, timeS: 124, replay: lapReplay });
    expect(rpcFetch.mock.calls[0][0]).toBe('https://database.example/rest/v1/rpc/shootout_replay');
    expect(sent()).toEqual({ p_season: season.id, p_car: 'all', p_rank: 3 });
    expect(response.headers.get('Cache-Control')).toBe('public, s-maxage=10, stale-while-revalidate=30');
    rpcFetch.mockResolvedValueOnce(Response.json([]));
    const missing = await handleShootoutRequest(new Request(`${url}?replay=4`), config());
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
    expect((await handleShootoutRequest(new Request(`${url}?replay=11`), config())).status).toBe(422);
    expect((await handleShootoutRequest(new Request(`${url}?replay=1.5`), config())).status).toBe(422);
  });

  it('makes service availability explicit when the database is not configured', async () => {
    const response = await handleShootoutRequest(new Request(url), { now: config().now });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, season, car: 'all', entries: [] });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('limits the public response to ten valid, contiguous entries', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json(Array.from({ length: 11 }, (_, i) => row(i + 1))));
    const response = await handleShootoutRequest(new Request(url), config());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, entries: [] });
    rpcFetch.mockResolvedValueOnce(Response.json([row(1), row(3)]));
    expect((await handleShootoutRequest(new Request(url), config())).status).toBe(503);
    rpcFetch.mockResolvedValueOnce(Response.json([{ ...row(1), time_s: 105 }]));
    expect((await handleShootoutRequest(new Request(url), config())).status).toBe(503);
  });

  it('handles a real Node HTTP request through the deployment adapter', async () => {
    const server = createServer((request, response) => { void shootout(request, response); });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    try {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Missing test server address');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/shootout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...start(), car: 'torana' }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: 'Choose an eligible car and an available attempt.' });
      const large = await fetch(`http://127.0.0.1:${address.port}/api/shootout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...submit(), nickname: '', replay: replay(124) }),
      });
      expect(large.status).toBe(422);
      expect(await large.json()).toMatchObject({ error: 'Enter a nickname.' });
    } finally {
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); });
    }
  });
});

describe('Shootout Arcade practice counts', () => {
  const practice = (kind: unknown, car: unknown = 'supra') => ({ action: 'practice', format: 'arcade', car, kind });

  it('counts a practice event per car without a browser token', async () => {
    rpcFetch.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await handleShootoutRequest(post(practice('valid_lap')), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: true });
    expect(String(rpcFetch.mock.calls[0][0])).toMatch(/\/rpc\/shootout_practice$/);
    expect(sent()).toEqual({ p_car: 'supra', p_kind: 'valid_lap' });
  });

  it.each([practice('crash'), practice('start', 'torana'), { ...practice('start'), format: 'top10' }])('rejects an invalid practice event %#', async (body) => {
    const response = await handleShootoutRequest(post(body), config());
    expect(response.status).toBe(422);
    expect(rpcFetch).not.toHaveBeenCalled();
  });
});
