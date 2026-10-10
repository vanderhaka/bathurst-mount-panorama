import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ShootoutStore } from '@/shootout/store';
import { fetchBoard, fetchLeaderboard, fetchReplay, publishShootoutAttempt, startShootoutAttempt } from '@/shootout/leaderboard';
import { currentSeason, encodeReplay, isShootoutAttempt, MAX_REPLAY_CHARS, REPLAY_FRAME_RATE, type ShootoutAttempt, type ShootoutOutcome } from '@/shootout/model';

class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  blocked = false;
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { if (this.blocked) throw new Error('blocked'); this.data.delete(key); }
  setItem(key: string, value: string): void { if (this.blocked) throw new Error('blocked'); this.data.set(key, value); }
}

const LEDGER = 'bathurst.shootout.v1';
const valid: ShootoutOutcome = { kind: 'valid', timeS: 124, sectorsS: [50, 38, 36] };
let storage: MemoryStorage;
let network: ReturnType<typeof vi.fn<typeof fetch>>;

function body(call: number): Record<string, unknown> {
  return JSON.parse(String(network.mock.calls[call][1]?.body)) as Record<string, unknown>;
}

function responseForStart(init?: RequestInit): Response {
  const data: unknown = JSON.parse(String(init?.body));
  if (typeof data !== 'object' || data === null || !('requestId' in data) || !('number' in data) || !('car' in data)) throw new Error('Missing start data');
  return Response.json({ attempt: { id: data.requestId, number: data.number, car: data.car, online: true, startedAt: new Date().toISOString() } });
}

function locks() {
  let queue = Promise.resolve<unknown>(undefined);
  return { request: (_name: string, callback: () => unknown) => {
    const work = queue.then(callback);
    queue = work.catch(() => undefined);
    return work;
  } };
}

function replay(seconds: number): string {
  const count = Math.round(seconds * REPLAY_FRAME_RATE) + 1;
  const frames = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) frames.set([i * 52 / REPLAY_FRAME_RATE, 0, 0, 0, 0, 0, 0, 52], i * 8);
  return encodeReplay(frames);
}

const ledger = () => JSON.parse(storage.getItem(LEDGER) ?? 'null') as { version: number; browserToken: string; attempts: Array<ShootoutAttempt & { season: string }> };

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', { randomUUID });
  vi.stubGlobal('navigator', { onLine: true, locks: locks() });
  network = vi.fn<typeof fetch>(async (_input, init) => {
    const data: unknown = JSON.parse(String(init?.body));
    if (typeof data === 'object' && data !== null && 'action' in data && data.action === 'start') return responseForStart(init);
    return Response.json({ publication: 'published', rank: 3, of: 20 });
  });
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Shootout browser quota', () => {
  it('does not consume an attempt while opening the menu or warming up', () => {
    const store = new ShootoutStore();
    expect(store.snapshot()).toEqual({ remaining: 3, attempts: [], nickname: '', writable: true, season: currentSeason(), blockedReason: null });
    expect(new ShootoutStore().snapshot().remaining).toBe(3);
    expect(network).not.toHaveBeenCalled();
    expect(storage.getItem(LEDGER)).toBeNull();
  });

  it('shares three attempts a week across cars, store instances, and reloads', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
    const first = new ShootoutStore();
    const attempt = await first.beginTimedLap('camaro', false);
    first.complete(attempt.id, { kind: 'invalid', timeS: null, reason: 'Retired' });
    await new ShootoutStore().beginTimedLap('mustang', false);
    await first.beginTimedLap('supra', false);
    const blocked = 'No attempts left this week. More from Monday 12 October, Sydney time.';
    expect(new ShootoutStore().snapshot()).toMatchObject({ remaining: 0, writable: true, blockedReason: blocked });
    await expect(first.beginTimedLap('camaro', false)).rejects.toThrow(blocked);
    await expect(first.reserveTimedLap('camaro')).rejects.toThrow(blocked);
    expect(first.snapshot().attempts.map((saved) => saved.attempt.number)).toEqual([1, 2, 3]);
  });

  it('starts a new season on Monday at midnight in Sydney with three fresh attempts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T12:59:00Z'));
    const store = new ShootoutStore();
    for (const car of ['camaro', 'mustang', 'supra'] as const) await store.beginTimedLap(car, false);
    expect(store.snapshot()).toMatchObject({ remaining: 0, season: { id: '2026-10-05' } });
    vi.setSystemTime(new Date('2026-10-11T13:00:00Z'));
    expect(store.snapshot()).toMatchObject({ remaining: 3, attempts: [], blockedReason: null,
      season: { id: '2026-10-12', startsAt: '2026-10-11T13:00:00.000Z', endsAt: '2026-10-18T13:00:00.000Z' } });
    const next = await store.reserveTimedLap('supra');
    expect(next.number).toBe(1);
    expect(ledger().attempts.map((saved) => [saved.season, saved.number])).toEqual([
      ['2026-10-05', 1], ['2026-10-05', 2], ['2026-10-05', 3], ['2026-10-12', 1]]);
  });

  it('migrates a version 1 ledger: each attempt belongs to the season it started in', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
    const token = randomUUID();
    const v1 = [
      { id: randomUUID(), number: 1, car: 'camaro', online: true, startedAt: '2026-10-03T01:00:00.000Z' },
      { id: randomUUID(), number: 2, car: 'mustang', online: false, startedAt: '2026-10-04T12:30:00.000Z' },
      { id: randomUUID(), number: 3, car: 'supra', online: true, startedAt: '2026-10-04T13:30:00.000Z' },
    ];
    storage.setItem(LEDGER, JSON.stringify({ version: 1, browserToken: token, attempts: v1 }));
    storage.setItem(`${LEDGER}.result.${v1[2].id}`, JSON.stringify({ attempt: v1[2], outcome: valid, nickname: 'James', publication: 'published' }));
    const store = new ShootoutStore();
    expect(store.snapshot()).toMatchObject({ remaining: 2, blockedReason: null, attempts: [{ attempt: v1[2], publication: 'published' }] });
    const attempt = await store.reserveTimedLap('camaro');
    expect(attempt.number).toBe(1);
    expect(ledger()).toMatchObject({ version: 2, browserToken: token, attempts: [
      { id: v1[0].id, season: '2026-09-28' }, { id: v1[1].id, season: '2026-09-28' }, { id: v1[2].id, season: '2026-10-05' },
      { id: attempt.id, number: 1, season: '2026-10-05' }] });
    expect(store.snapshot().remaining).toBe(1);
  });

  it('drops attempts and replays from seasons that can no longer publish', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T09:00:00Z'));
    const store = new ShootoutStore();
    const old = await store.beginTimedLap('camaro', false);
    store.complete(old.id, valid);
    store.saveReplay(old.id, replay(124));
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'));
    const lastWeek = await store.beginTimedLap('camaro', false);
    vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
    await store.reserveTimedLap('camaro');
    expect(ledger().attempts.map((saved) => saved.id)).not.toContain(old.id);
    expect(ledger().attempts.map((saved) => saved.id)).toContain(lastWeek.id);
    expect([...storage.data.keys()].filter((key) => key.includes(old.id))).toEqual([]);
  });

  it('serializes simultaneous starts in different tabs without losing quota', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => new ShootoutStore().beginTimedLap('camaro', true)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect(network).toHaveBeenCalledTimes(3);
    expect(new ShootoutStore().snapshot().attempts.map((saved) => saved.attempt.number)).toEqual([1, 2, 3]);
  });

  it('keeps an earlier tab result while another tab is awaiting allocation', async () => {
    const first = new ShootoutStore();
    const attempt = await first.beginTimedLap('camaro', false);
    let release: (() => void) | undefined;
    network.mockImplementationOnce(async (_input, init) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return responseForStart(init);
    });
    const next = new ShootoutStore().beginTimedLap('mustang', true);
    await vi.waitFor(() => expect(network).toHaveBeenCalledOnce());
    first.complete(attempt.id, valid);
    release?.();
    await next;
    expect(first.snapshot().attempts).toHaveLength(2);
    expect(first.snapshot().attempts[0].outcome).toEqual(valid);
  });

  it('rolls back a start rejected by server validation without consuming quota', async () => {
    network.mockResolvedValueOnce(Response.json({ error: 'Invalid attempt' }, { status: 422 }));
    const store = new ShootoutStore();
    await expect(store.beginTimedLap('camaro', true)).rejects.toThrow('Invalid attempt');
    expect(store.snapshot().remaining).toBe(3);
  });

  it('fails clearly on corrupt or blocked storage without resetting quota, and works without Web Locks', async () => {
    storage.setItem(LEDGER, '{bad json');
    const store = new ShootoutStore();
    expect(store.snapshot()).toMatchObject({ writable: false, remaining: 0, blockedReason: expect.stringContaining('corrupt') });
    await expect(store.beginTimedLap('camaro', false)).rejects.toThrow('corrupt');
    await expect(store.reserveTimedLap('camaro')).rejects.toThrow('corrupt');
    expect(storage.getItem(LEDGER)).toBe('{bad json');
    storage.clear();
    storage.blocked = true;
    expect(store.snapshot()).toMatchObject({ writable: false, blockedReason: expect.stringContaining('blocked') });
    await expect(store.beginTimedLap('camaro', false)).rejects.toThrow('full or blocked');
    storage.blocked = false;
    vi.stubGlobal('navigator', { onLine: true });
    expect(store.snapshot()).toMatchObject({ writable: true, blockedReason: null });
    await store.beginTimedLap('camaro', false);
    const reserved = await store.reserveTimedLap('mustang');
    expect(store.snapshot().attempts.map((saved) => saved.attempt.id)).toContain(reserved.id);
  });
});

describe('Shootout start-line reservation', () => {
  it('saves the attempt at once, then allocates it in the background', async () => {
    const store = new ShootoutStore();
    const attempt = await store.reserveTimedLap('mustang');
    expect(attempt).toMatchObject({ number: 1, car: 'mustang', online: false });
    expect(network).not.toHaveBeenCalled();
    expect(store.snapshot()).toMatchObject({ remaining: 2, attempts: [{ attempt, outcome: null }] });
    await store.allocateInBackground(attempt.id);
    expect(body(0)).toMatchObject({ action: 'start', requestId: attempt.id, number: 1, car: 'mustang', season: currentSeason().id });
    expect(store.snapshot().attempts[0].attempt).toMatchObject({ id: attempt.id, online: true });
    await store.allocateInBackground(attempt.id);
    expect(network).toHaveBeenCalledOnce();
  });

  it('retries a failed allocation a few times, never throws, and leaves it for submit', async () => {
    const store = new ShootoutStore({ allocationRetryMs: [0, 0] });
    const attempt = await store.reserveTimedLap('camaro');
    network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    network.mockResolvedValueOnce(Response.json({ error: 'The leaderboard is down right now.' }, { status: 503 }));
    await store.allocateInBackground(attempt.id);
    expect(network).toHaveBeenCalledTimes(3);
    expect(store.snapshot().attempts[0].attempt.online).toBe(true);

    const next = await store.reserveTimedLap('supra');
    network.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(store.allocateInBackground(next.id)).resolves.toBeUndefined();
    expect(network).toHaveBeenCalledTimes(6);
    await expect(store.allocateInBackground(randomUUID())).resolves.toBeUndefined();
    network.mockImplementation(async (_input, init) => body(network.mock.calls.length - 1).action === 'start'
      ? responseForStart(init) : Response.json({ publication: 'published', rank: 1, of: 2 }));
    store.complete(next.id, valid);
    expect(await store.submit(next.id, 'James')).toBe('published');
  });

  it('stops retrying once the server could no longer verify the lap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T09:00:00Z'));
    const store = new ShootoutStore({ allocationRetryMs: [0, 0, 0] });
    const attempt = await store.reserveTimedLap('camaro');
    vi.setSystemTime(new Date('2026-10-10T09:00:16Z'));
    network.mockRejectedValue(new TypeError('Failed to fetch'));
    await store.allocateInBackground(attempt.id);
    expect(network).toHaveBeenCalledOnce();
  });

  it('keeps a refused allocation as an error the player can skip', async () => {
    const store = new ShootoutStore();
    const attempt = await store.reserveTimedLap('camaro');
    network.mockResolvedValueOnce(Response.json({ error: 'No attempts left on this browser this week.' }, { status: 409 }));
    await store.allocateInBackground(attempt.id);
    expect(store.publishError(attempt.id)).toBe('No attempts left on this browser this week.');
    store.complete(attempt.id, valid);
    expect(store.snapshot().blockedReason).toBeNull();
    await expect(store.submit(attempt.id, 'James')).rejects.toThrow('No attempts left on this browser this week.');
    expect(network).toHaveBeenCalledOnce();
    expect(store.snapshot().attempts[0]).toMatchObject({ nickname: null, publication: 'pending' });
    store.skip(attempt.id);
    expect(store.snapshot().attempts[0].publication).toBe('skipped');
  });

  it('works without Web Locks', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const store = new ShootoutStore();
    const attempt = await store.reserveTimedLap('supra');
    await store.allocateInBackground(attempt.id);
    expect(store.snapshot().attempts[0].attempt.online).toBe(true);
  });
});

describe('Shootout saved results', () => {
  it('retains skipped and invalid attempts without publishing them', async () => {
    const store = new ShootoutStore();
    const skipped = await store.beginTimedLap('camaro', true);
    store.complete(skipped.id, valid);
    store.skip(skipped.id);
    const invalid = await store.beginTimedLap('supra', true);
    store.complete(invalid.id, { kind: 'invalid', timeS: 124, reason: 'Cut the track' });
    await expect(store.submit(skipped.id, 'James')).rejects.toThrow('skipped');
    await expect(store.submit(invalid.id, 'James')).rejects.toThrow('skipped');
    expect(new ShootoutStore().snapshot()).toMatchObject({ remaining: 1 });
    expect(new ShootoutStore().snapshot().attempts.every((saved) => saved.publication === 'skipped')).toBe(true);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('asks for a nickname or a skip before the next attempt', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    expect(store.snapshot().blockedReason).toMatch(/nickname.*skip/);
    await expect(store.reserveTimedLap('camaro')).rejects.toThrow('nickname');
    store.skip(attempt.id);
    expect(store.snapshot().blockedReason).toBeNull();
  });

  it('saves a result and nickname offline without claiming publication', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', false);
    store.complete(attempt.id, valid);
    expect(await store.submit(attempt.id, ' James ')).toBe('saved');
    expect(new ShootoutStore().snapshot()).toMatchObject({ nickname: 'James', remaining: 2, blockedReason: null,
      attempts: [{ publication: 'pending', nickname: 'James', outcome: valid }] });
    expect(network).not.toHaveBeenCalled();
  });

  it('retries an uncertain start with the same request ID after reloading', async () => {
    network.mockRejectedValueOnce(new Error('Lost response'));
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('mustang', true);
    expect(attempt.online).toBe(false);
    store.complete(attempt.id, valid);
    const reloaded = new ShootoutStore();
    expect(await reloaded.submit(attempt.id, 'James')).toBe('published');
    expect(network).toHaveBeenCalledTimes(3);
    expect(body(1)).toEqual(body(0));
    expect(reloaded.snapshot().attempts[0]).toMatchObject({ attempt: { id: attempt.id, online: true }, publication: 'published' });
    expect(reloaded.snapshot().remaining).toBe(2);
  });

  it('retains pending allocated results across an outage and publishes once on retry', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    network.mockRejectedValueOnce(new Error('Offline'));
    expect(await store.submit(attempt.id, 'James')).toBe('saved');
    const reloaded = new ShootoutStore();
    expect(reloaded.snapshot().attempts[0].publication).toBe('pending');
    expect(await reloaded.submit(attempt.id, 'James')).toBe('published');
    expect(await reloaded.submit(attempt.id, 'James')).toBe('published');
    expect(network).toHaveBeenCalledTimes(3);
    expect(reloaded.snapshot().attempts[0].nickname).toBe('James');
  });

  it('keeps a result pending when navigator reports offline', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    vi.stubGlobal('navigator', { onLine: false });
    expect(await store.submit(attempt.id, 'James')).toBe('saved');
    expect(network).toHaveBeenCalledOnce();
    expect(store.snapshot().attempts[0].publication).toBe('pending');
  });

  it('rejects unnamed publication and preserves the first result and saved nickname', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', false);
    store.complete(attempt.id, valid);
    store.complete(attempt.id, valid);
    expect(() => store.complete(attempt.id, { ...valid, timeS: 125, sectorsS: [50, 38, 37] })).toThrow('already has a result');
    await expect(store.submit(attempt.id, '  ')).rejects.toThrow('nickname');
    await expect(store.submit(attempt.id, 'Ja‮mes')).rejects.toThrow('hidden');
    await expect(store.submit(attempt.id, 'B1tch')).rejects.toThrow('different nickname');
    expect(await store.submit(attempt.id, 'James')).toBe('saved');
    await expect(store.submit(attempt.id, 'Someone else')).rejects.toThrow('nickname already saved');
    expect(() => store.skip(attempt.id)).toThrow('already saved for publication');
  });

  it('reports persistence failure and detects corrupted results instead of silently dropping them', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', false);
    storage.blocked = true;
    expect(() => store.complete(attempt.id, valid)).toThrow('full or blocked');
    storage.blocked = false;
    storage.setItem(`${LEDGER}.result.${attempt.id}`, '{broken');
    expect(store.snapshot().writable).toBe(false);
    expect(() => store.complete(attempt.id, valid)).toThrow('corrupt');
  });

  it('does not let a forged stored car qualify for the competition', async () => {
    const attempt = await new ShootoutStore().beginTimedLap('camaro', false);
    expect(isShootoutAttempt({ ...attempt, car: 'torana' })).toBe(false);
    storage.setItem(LEDGER, JSON.stringify({ ...ledger(), attempts: [{ ...ledger().attempts[0], car: 'torana' }] }));
    expect(new ShootoutStore().snapshot().writable).toBe(false);
  });

  it('keeps results saved under the old floors readable', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    storage.setItem(`${LEDGER}.result.${attempt.id}`, JSON.stringify({ attempt, outcome: { kind: 'valid', timeS: 105, sectorsS: [40, 30, 35] },
      nickname: 'James', publication: 'pending' }));
    expect(store.snapshot()).toMatchObject({ writable: true, attempts: [{ nickname: 'James' }] });
  });
});

describe('Shootout publication', () => {
  it('uploads the saved replay and keeps the rank', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    const lapReplay = replay(124);
    store.saveReplay(attempt.id, lapReplay);
    store.saveReplay(attempt.id, 'not a replay');
    store.saveReplay(randomUUID(), lapReplay);
    expect(store.rankOf(attempt.id)).toBeNull();
    expect(await store.submit(attempt.id, 'James')).toBe('published');
    expect(body(1)).toMatchObject({ action: 'submit', attemptId: attempt.id, nickname: 'James', timeS: 124, sectorsS: [50, 38, 36], replay: lapReplay });
    expect(store.rankOf(attempt.id)).toEqual({ rank: 3, of: 20 });
    expect(new ShootoutStore().rankOf(attempt.id)).toEqual({ rank: 3, of: 20 });
  });

  it('publishes without a replay when none was saved', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    store.saveReplay(attempt.id, 'A'.repeat(MAX_REPLAY_CHARS + 4));
    expect(await store.submit(attempt.id, 'James')).toBe('published');
    expect(body(1)).not.toHaveProperty('replay');
  });

  it('never locks the player out after a refused publication', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    network.mockResolvedValueOnce(Response.json({ error: 'Choose a different nickname.' }, { status: 422 }));
    await expect(store.submit(attempt.id, 'James')).rejects.toThrow('Choose a different nickname.');
    expect(store.publishError(attempt.id)).toBe('Choose a different nickname.');
    expect(new ShootoutStore().snapshot()).toMatchObject({ blockedReason: null, attempts: [{ nickname: null, publication: 'pending' }] });
    expect(await store.submit(attempt.id, 'Jim')).toBe('published');
    expect(store.publishError(attempt.id)).toBeNull();
    expect(store.snapshot().attempts[0]).toMatchObject({ nickname: 'Jim', publication: 'published' });
  });

  it('lets the player skip a lap the leaderboard could not verify', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    const message = 'This lap could not be verified: the leaderboard did not see it start in time.';
    network.mockResolvedValueOnce(Response.json({ error: message }, { status: 422 }));
    await expect(store.submit(attempt.id, 'James')).rejects.toThrow(message);
    expect(store.snapshot().blockedReason).toBeNull();
    store.skip(attempt.id);
    expect(store.snapshot().attempts[0].publication).toBe('skipped');
  });

  it('explains a start limit at submit and keeps the lap queued', async () => {
    network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', true);
    store.complete(attempt.id, valid);
    network.mockResolvedValueOnce(Response.json({ error: 'Too many Shootout starts from your network. Try again in an hour.' }, { status: 429 }));
    await expect(store.submit(attempt.id, 'James')).rejects.toThrow('Try again in an hour');
    expect(store.publishError(attempt.id)).toBeNull();
    expect(store.snapshot().attempts[0]).toMatchObject({ nickname: 'James', publication: 'pending' });
  });

  it('tells offline apart from a server that is not responding', async () => {
    const attempt: ShootoutAttempt = { id: randomUUID(), number: 1, car: 'camaro', online: true, startedAt: new Date().toISOString() };
    network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(startShootoutAttempt(randomUUID(), attempt)).rejects.toThrow("You're offline");
    network.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(publishShootoutAttempt(randomUUID(), { attempt, nickname: 'James', timeS: 124, sectorsS: [50, 38, 36] })).rejects.toThrow('not responding');
    network.mockResolvedValueOnce(new Response('<html>', { status: 502 }));
    await expect(startShootoutAttempt(randomUUID(), attempt)).rejects.toThrow('bad reply');
  });
});

describe('Top 10 boards', () => {
  const season = currentSeason();
  const entry = (rank: number, car = 'camaro') => ({ id: randomUUID(), rank, nickname: 'James', car, timeS: 123 + rank });

  it('returns the season board for a car, with attempt ids', async () => {
    const entries = [entry(1, 'mustang'), entry(2, 'mustang')];
    network.mockResolvedValueOnce(Response.json({ available: true, season, car: 'mustang', entries }));
    expect(await fetchBoard('mustang')).toEqual({ available: true, season, car: 'mustang', entries });
    expect(network.mock.calls[0][0]).toBe('/api/shootout?car=mustang');
  });

  it('distinguishes an empty leaderboard from an unavailable service', async () => {
    network.mockResolvedValueOnce(Response.json({ available: true, season, car: 'all', entries: [] }));
    expect(await fetchLeaderboard()).toEqual({ available: true, entries: [] });
    network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await fetchLeaderboard()).toEqual({ available: false, entries: [] });
  });

  it('says whether the device is offline or the server failed, and never throws', async () => {
    network.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await fetchBoard()).toEqual({ available: false, season, car: 'all', entries: [], unavailable: 'offline' });
    network.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(await fetchBoard('supra')).toMatchObject({ available: false, car: 'supra', unavailable: 'server' });
    network.mockResolvedValueOnce(Response.json({ available: false, entries: [] }, { status: 503 }));
    expect(await fetchBoard()).toMatchObject({ available: false, unavailable: 'server' });
    network.mockResolvedValueOnce(new Response('not json'));
    expect(await fetchBoard()).toMatchObject({ available: false, unavailable: 'server' });
    vi.stubGlobal('navigator', { onLine: false });
    const calls = network.mock.calls.length;
    expect(await fetchBoard()).toMatchObject({ available: false, unavailable: 'offline' });
    expect(network.mock.calls.length).toBe(calls);
  });

  it('rejects malformed or excessive public results', async () => {
    for (const data of [
      { available: true, season, car: 'all', entries: [{ ...entry(1), car: 'torana' }] },
      { available: true, season, car: 'all', entries: [{ ...entry(1), nickname: null }] },
      { available: true, season, car: 'all', entries: [{ ...entry(1), id: 'mine' }] },
      { available: true, season, car: 'all', entries: [entry(2)] },
      { available: true, season, car: 'all', entries: Array.from({ length: 11 }, (_, i) => entry(i + 1)) },
      { available: true, season, car: 'supra', entries: [] },
      { available: true, season: { id: '2026-10-06' }, car: 'all', entries: [] },
    ]) {
      network.mockResolvedValueOnce(Response.json(data));
      expect(await fetchBoard()).toMatchObject({ available: false, entries: [], unavailable: 'server' });
    }
    network.mockResolvedValueOnce(Response.json({ available: true, season, car: 'mustang', entries: [entry(1, 'camaro')] }));
    expect(await fetchBoard('mustang')).toMatchObject({ available: false });
  });

  it('decodes a board replay for the Arcade ghost', async () => {
    const lapReplay = replay(124);
    network.mockResolvedValueOnce(Response.json({ season, car: 'supra', rank: 2, timeS: 124, replay: lapReplay }));
    const result = await fetchReplay('all', 2);
    expect(network.mock.calls[0][0]).toBe('/api/shootout?car=all&replay=2');
    expect(result).toMatchObject({ car: 'supra', timeS: 124 });
    expect(result?.frames.length).toBe((124 * REPLAY_FRAME_RATE + 1) * 8);
    network.mockResolvedValueOnce(Response.json({ error: 'There is no replay for that place yet.' }, { status: 404 }));
    expect(await fetchReplay('all', 3)).toBeNull();
    network.mockResolvedValueOnce(Response.json({ season, car: 'supra', rank: 1, timeS: 124, replay: lapReplay }));
    expect(await fetchReplay('camaro', 1)).toBeNull();
    network.mockResolvedValueOnce(Response.json({ season, car: 'supra', rank: 1, timeS: 124, replay: 'broken' }));
    expect(await fetchReplay('all', 1)).toBeNull();
    expect(await fetchReplay('all', 11)).toBeNull();
  });
});
