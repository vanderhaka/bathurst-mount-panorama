import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ShootoutStore } from '@/shootout/store';
import { fetchLeaderboard } from '@/shootout/leaderboard';
import { isShootoutAttempt, type ShootoutOutcome } from '@/shootout/model';

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

const valid: ShootoutOutcome = { kind: 'valid', timeS: 124, sectorsS: [50, 40, 34] };
let storage: MemoryStorage;
let network: ReturnType<typeof vi.fn<typeof fetch>>;

function responseForStart(init?: RequestInit): Response {
  const body: unknown = JSON.parse(String(init?.body));
  if (typeof body !== 'object' || body === null || !('requestId' in body) || !('number' in body) || !('car' in body)) throw new Error('Missing start data');
  return Response.json({ attempt: { id: body.requestId, number: body.number, car: body.car, online: true, startedAt: new Date().toISOString() } });
}

beforeEach(() => {
  storage = new MemoryStorage();
  let queue = Promise.resolve<unknown>(undefined);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', { randomUUID });
  vi.stubGlobal('navigator', { onLine: true, locks: {
    request: (_name: string, callback: () => unknown) => {
      const work = queue.then(callback);
      queue = work.catch(() => undefined);
      return work;
    },
  } });
  network = vi.fn<typeof fetch>(async (_input, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    if (typeof body === 'object' && body !== null && 'action' in body && body.action === 'start') return responseForStart(init);
    return Response.json({ publication: 'published' });
  });
  vi.stubGlobal('fetch', network);
});

afterEach(() => vi.unstubAllGlobals());

describe('Shootout browser quota', () => {
  it('does not consume an attempt while opening the menu or warming up', () => {
    const store = new ShootoutStore();
    expect(store.snapshot()).toEqual({ remaining: 3, attempts: [], nickname: '', writable: true });
    expect(new ShootoutStore().snapshot().remaining).toBe(3);
    expect(network).not.toHaveBeenCalled();
    expect(storage.getItem('bathurst.shootout.v1')).toBeNull();
  });

  it('shares three total attempts across cars, store instances, and reloads', async () => {
    const first = new ShootoutStore();
    const attempt = await first.beginTimedLap('camaro', false);
    first.complete(attempt.id, { kind: 'invalid', timeS: null, reason: 'Retired' });
    await new ShootoutStore().beginTimedLap('mustang', false);
    await first.beginTimedLap('supra', false);
    expect(new ShootoutStore().snapshot()).toMatchObject({ remaining: 0, writable: true });
    await expect(first.beginTimedLap('camaro', false)).rejects.toThrow('All three');
    expect(first.snapshot().attempts.map((saved) => saved.attempt.number)).toEqual([1, 2, 3]);
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

  it('fails clearly on corrupt, blocked, or unsafe storage without resetting quota', async () => {
    storage.setItem('bathurst.shootout.v1', '{bad json');
    const store = new ShootoutStore();
    expect(store.snapshot().writable).toBe(false);
    await expect(store.beginTimedLap('camaro', false)).rejects.toThrow('corrupt');
    expect(storage.getItem('bathurst.shootout.v1')).toBe('{bad json');
    storage.clear();
    storage.blocked = true;
    expect(store.snapshot().writable).toBe(false);
    await expect(store.beginTimedLap('camaro', false)).rejects.toThrow('full or blocked');
    storage.blocked = false;
    vi.stubGlobal('navigator', { onLine: true });
    await expect(store.beginTimedLap('camaro', false)).rejects.toThrow('between tabs');
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

  it('saves a result and nickname offline without claiming publication', async () => {
    const store = new ShootoutStore();
    const attempt = await store.beginTimedLap('camaro', false);
    store.complete(attempt.id, valid);
    expect(await store.submit(attempt.id, ' James ')).toBe('saved');
    expect(new ShootoutStore().snapshot()).toMatchObject({ nickname: 'James', remaining: 2,
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
    const firstBody: unknown = JSON.parse(String(network.mock.calls[0][1]?.body));
    const retriedBody: unknown = JSON.parse(String(network.mock.calls[1][1]?.body));
    expect(retriedBody).toEqual(firstBody);
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
    expect(() => store.complete(attempt.id, { ...valid, timeS: 125, sectorsS: [50, 40, 35] })).toThrow('already has a result');
    await expect(store.submit(attempt.id, '  ')).rejects.toThrow('nickname');
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
    storage.setItem(`bathurst.shootout.v1.result.${attempt.id}`, '{broken');
    expect(store.snapshot().writable).toBe(false);
    expect(() => store.complete(attempt.id, valid)).toThrow('corrupt');
  });

  it('does not let a forged stored car qualify for the competition', async () => {
    const attempt = await new ShootoutStore().beginTimedLap('camaro', false);
    expect(isShootoutAttempt({ ...attempt, car: 'torana' })).toBe(false);
    const ledger: unknown = JSON.parse(storage.getItem('bathurst.shootout.v1') ?? '{}');
    if (typeof ledger !== 'object' || ledger === null) throw new Error('Missing ledger');
    storage.setItem('bathurst.shootout.v1', JSON.stringify({ ...ledger, attempts: [{ ...attempt, car: 'torana' }] }));
    expect(new ShootoutStore().snapshot().writable).toBe(false);
  });
});

describe('Top 10 availability', () => {
  it('distinguishes an empty leaderboard from an unavailable service', async () => {
    network.mockResolvedValueOnce(Response.json({ available: true, entries: [] }));
    expect(await fetchLeaderboard()).toEqual({ available: true, entries: [] });
    network.mockRejectedValueOnce(new Error('Offline'));
    expect(await fetchLeaderboard()).toEqual({ available: false, entries: [] });
  });

  it('rejects malformed or excessive public results', async () => {
    network.mockResolvedValueOnce(Response.json({ available: true, entries: [{ rank: 1, nickname: 'James', car: 'torana', timeS: 124 }] }));
    expect(await fetchLeaderboard()).toEqual({ available: false, entries: [] });
    network.mockResolvedValueOnce(Response.json({ available: true, entries: [{ rank: 1, nickname: null, car: 'camaro', timeS: 124 }] }));
    expect(await fetchLeaderboard()).toEqual({ available: false, entries: [] });
    network.mockResolvedValueOnce(Response.json({ available: true, entries: Array.from({ length: 11 }, (_, i) => ({ rank: i + 1, nickname: 'James', car: 'camaro', timeS: 124 })) }));
    expect(await fetchLeaderboard()).toEqual({ available: false, entries: [] });
  });
});
