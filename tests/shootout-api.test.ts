import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import shootout, { handleShootoutRequest } from '../api/shootout';

const url = 'https://bathurst.example/api/shootout';
const browserToken = randomUUID();
const requestId = randomUUID();
let rpcFetch: ReturnType<typeof vi.fn<typeof fetch>>;

const start = () => ({ action: 'start', format: 'top10', browserToken, requestId, car: 'camaro', number: 1 });
const submit = () => ({ action: 'submit', format: 'top10', browserToken, attemptId: requestId, nickname: ' James ', timeS: 124, sectorsS: [50, 40, 34] });
function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
function config() { return { supabaseUrl: 'https://database.example', serviceKey: 'test-service-key', fetch: rpcFetch }; }

beforeEach(() => {
  vi.stubEnv('SHOOTOUT_SUPABASE_URL', '');
  vi.stubEnv('SHOOTOUT_SUPABASE_SERVICE_KEY', '');
  rpcFetch = vi.fn<typeof fetch>();
});
afterEach(() => vi.unstubAllEnvs());

describe('Shootout API validation', () => {
  it.each([
    { ...start(), car: 'torana' }, { ...start(), number: 0 }, { ...start(), number: 4 },
    { ...start(), number: 1.5 }, { ...start(), browserToken: 'anonymous' }, { ...start(), requestId: 'wrong' },
    { ...start(), action: 'arcade' },
    { ...start(), format: 'arcade' },
  ])('does not allocate a rejected start %#', async (body) => {
    const response = await handleShootoutRequest(post(body), config());
    expect(response.status).toBe(422);
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...submit(), nickname: '' }, { ...submit(), nickname: ' '.repeat(3) },
    { ...submit(), nickname: 'x'.repeat(25) }, { ...submit(), nickname: 'James\nFake' },
    { ...submit(), timeS: 99 }, { ...submit(), timeS: 601, sectorsS: [200, 200, 201] }, { ...submit(), timeS: Infinity },
    { ...submit(), sectorsS: [1, 2, 3] }, { ...submit(), sectorsS: [50, 74] },
    { ...submit(), sectorsS: [-10, 100, 34] }, { ...submit(), sectorsS: [50, null, 74] },
    { ...submit(), attemptId: 'not-allocated' },
  ])('rejects an invalid result before sending any database request %#', async (body) => {
    expect((await handleShootoutRequest(post(body), config())).status).toBe(422);
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  it('rejects cross-origin, non-JSON, oversized, and malformed requests without allocating', async () => {
    expect((await handleShootoutRequest(post(start(), { Origin: 'https://elsewhere.example' }), config())).status).toBe(403);
    expect((await handleShootoutRequest(new Request(url, { method: 'POST', body: '{}' }), config())).status).toBe(415);
    expect((await handleShootoutRequest(post({ ...start(), junk: 'x'.repeat(9000) }), config())).status).toBe(413);
    expect((await handleShootoutRequest(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' }), config())).status).toBe(400);
    expect(rpcFetch).not.toHaveBeenCalled();
  });
});

describe('Shootout API gateway', () => {
  it('hashes the browser token and returns only the allocated attempt', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ id: requestId, number: 1, car: 'camaro', started_at: '2026-10-10T00:00:00.000Z' }]));
    const response = await handleShootoutRequest(post(start(), { Origin: 'https://bathurst.example' }), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attempt: { id: requestId, number: 1, car: 'camaro', online: true, startedAt: '2026-10-10T00:00:00.000Z' } });
    expect(rpcFetch.mock.calls[0][0]).toBe('https://database.example/rest/v1/rpc/shootout_start');
    const sent: unknown = JSON.parse(String(rpcFetch.mock.calls[0][1]?.body));
    expect(sent).toEqual({ p_browser_hash: createHash('sha256').update(browserToken).digest('hex'), p_attempt_id: requestId, p_attempt_number: 1, p_car: 'camaro' });
    expect(JSON.stringify(sent)).not.toContain(browserToken);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('normalizes a nickname and confirms publication only after the submit RPC', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ publication: 'published' }]));
    const response = await handleShootoutRequest(post(submit()), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publication: 'published' });
    const sent: unknown = JSON.parse(String(rpcFetch.mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ p_attempt_id: requestId, p_nickname: 'James', p_time_s: 124, p_sectors_s: [50, 40, 34] });
  });

  it.each([
    ['shootout_quota_exhausted', 409], ['shootout_request_conflict', 409],
    ['shootout_result_conflict', 409], ['shootout_attempt_not_found', 404],
  ])('returns the durable rejection for %s', async (message, expectedStatus) => {
    rpcFetch.mockResolvedValueOnce(Response.json({ code: 'P0001', message }, { status: 400 }));
    expect((await handleShootoutRequest(post(submit()), config())).status).toBe(expectedStatus);
  });

  it('does not claim allocation or publication after a corrupt provider response', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ id: requestId, number: 1, car: 'torana', started_at: '2026-10-10T00:00:00.000Z' }]));
    expect((await handleShootoutRequest(post(start()), config())).status).toBe(503);
    rpcFetch.mockResolvedValueOnce(Response.json([{ publication: 'pending' }]));
    expect((await handleShootoutRequest(post(submit()), config())).status).toBe(503);
  });

  it('hides provider diagnostics and server configuration from public responses', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json({ message: 'Private provider diagnostics test-service-key' }, { status: 500 }));
    const response = await handleShootoutRequest(post(start()), config());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/diagnostics|test-service-key|database\.example/);
  });

  it('serves the Top 10 without exposing browser identifiers', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json([{ rank: 1, nickname: 'James', car: 'supra', time_s: 124, browser_hash: 'private' }]));
    const response = await handleShootoutRequest(new Request(url), config());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, entries: [{ rank: 1, nickname: 'James', car: 'supra', timeS: 124 }] });
  });

  it('makes service availability explicit when the database is not configured', async () => {
    const response = await handleShootoutRequest(new Request(url));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, entries: [] });
  });

  it('limits the public response to ten valid entries', async () => {
    rpcFetch.mockResolvedValueOnce(Response.json(Array.from({ length: 11 }, (_, i) => ({ rank: i + 1, nickname: 'James', car: 'camaro', time_s: 124 }))));
    const response = await handleShootoutRequest(new Request(url), config());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, entries: [] });
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
    } finally {
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); });
    }
  });
});
