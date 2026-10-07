import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createWorkerSource } from '@/offline/worker-runtime';

const origin = 'https://game.test';
const config = { cacheName: 'bathurst-game-new', rootPath: '/', files: ['/', '/index.html', '/assets/game-123.js', '/assets/font-456.woff2'] };

function worker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const requests: Request[] = [];
  let offline = false;
  let failPath = '';
  let clients = [{ id: 'boot', url: origin + '/' }];
  const fetch = vi.fn(async (request: Request) => {
    if (offline || new URL(request.url).pathname === failPath) throw new Error('network off');
    return new Response('network:' + new URL(request.url).pathname);
  });
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async addAll(files: Request[]) {
          for (const request of files) {
            requests.push(request);
            store.set(new URL(request.url).pathname, await fetch(request));
          }
        },
        async match(url: string) { return store.get(new URL(url, origin).pathname)?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  const claim = vi.fn(async () => {});
  const skipWaiting = vi.fn(async () => {});
  runInNewContext(createWorkerSource(config), {
    addEventListener: (name: string, listener: (event: Record<string, unknown>) => void) => listeners.set(name, listener),
    location: { origin }, registration: { scope: origin + '/' }, caches, fetch, skipWaiting,
    clients: { matchAll: async () => clients, claim }, URL, Request, Set,
  });
  async function dispatch(name: string, data: Record<string, unknown> = {}): Promise<Response | undefined> {
    const jobs: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const listener = listeners.get(name);
    if (!listener) throw new Error('Missing worker handler: ' + name);
    listener({ ...data, waitUntil: (job: Promise<unknown>) => jobs.push(job), respondWith: (job: Promise<Response>) => { response = job; } });
    await Promise.all(jobs);
    return response;
  }
  return { stores, requests, fetch, claim, skipWaiting, dispatch,
    offline: () => { offline = true; }, fail: (path: string) => { failPath = path; },
    clients: (next: typeof clients) => { clients = next; },
  };
}

describe('generated service worker cache lifecycle', () => {
  it('installs the emitted list separately and never activates automatically while installing', async () => {
    const w = worker();
    w.stores.set('bathurst-game-old', new Map());
    await w.dispatch('install');
    expect(w.requests.map((r) => new URL(r.url).pathname)).toEqual(config.files);
    expect(w.requests.find((r) => r.url.endsWith('/index.html'))?.cache).toBe('reload');
    expect(w.requests.find((r) => r.url.endsWith('.js'))?.cache).toBe('default');
    expect(w.stores.has('bathurst-game-old')).toBe(true);
    expect(w.skipWaiting).not.toHaveBeenCalled();
    expect(w.claim).not.toHaveBeenCalled();
  });

  it('keeps the prior cache if an offline/failed install cannot fetch every required file', async () => {
    const w = worker();
    w.stores.set('bathurst-game-old', new Map());
    w.fail('/assets/font-456.woff2');
    await expect(w.dispatch('install')).rejects.toThrow('network off');
    expect(w.stores.has('bathurst-game-old')).toBe(true);
    expect(w.stores.has(config.cacheName)).toBe(false);
    expect(w.skipWaiting).not.toHaveBeenCalled();
  });

  it('deletes only older game caches on activation, keeping unrelated cache data', async () => {
    const w = worker();
    w.stores.set('bathurst-game-old', new Map());
    w.stores.set('another-app', new Map());
    await w.dispatch('install');
    await w.dispatch('activate');
    expect([...w.stores.keys()].sort()).toEqual(['another-app', config.cacheName]);
    expect(w.claim).toHaveBeenCalledTimes(1);
  });

  it('activates only on the explicit startup message from the sole open game client', async () => {
    const w = worker();
    const reply = vi.fn();
    await w.dispatch('message', { data: { type: 'UNRELATED' }, source: { id: 'boot' }, ports: [{ postMessage: reply }] });
    expect(w.skipWaiting).not.toHaveBeenCalled();
    await w.dispatch('message', { data: { type: 'ACTIVATE_AT_START' }, source: { id: 'boot' }, ports: [{ postMessage: reply }] });
    expect(w.skipWaiting).toHaveBeenCalledTimes(1);
    w.clients([{ id: 'boot', url: origin + '/' }, { id: 'race', url: origin + '/' }]);
    await w.dispatch('message', { data: { type: 'ACTIVATE_AT_START' }, source: { id: 'boot' }, ports: [{ postMessage: reply }] });
    expect(w.skipWaiting).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith('defer');
  });
});

describe('generated service worker fetch policy', () => {
  it('starts from the cached root and serves hashed game files/fonts with the network off', async () => {
    const w = worker();
    await w.dispatch('install');
    w.offline();
    const root = await w.dispatch('fetch', { request: new Request(origin + '/?view=phone') });
    expect(await root?.text()).toBe('network:/index.html');
    const game = await w.dispatch('fetch', { request: new Request(origin + '/assets/game-123.js') });
    const font = await w.dispatch('fetch', { request: new Request(origin + '/assets/font-456.woff2') });
    expect(await game?.text()).toBe('network:/assets/game-123.js');
    expect(await font?.text()).toBe('network:/assets/font-456.woff2');
  });

  it('allows a fresh online root (including Vite development) without mixing it into the immutable cache', async () => {
    const w = worker();
    await w.dispatch('install');
    const root = await w.dispatch('fetch', { request: new Request(origin + '/') });
    expect(await root?.text()).toBe('network:/');
    w.offline();
    const old = await w.dispatch('fetch', { request: new Request(origin + '/') });
    expect(await old?.text()).toBe('network:/index.html');
  });

  it('leaves HMR, nonmanifest files, external requests and mutations to the browser', async () => {
    const w = worker();
    await w.dispatch('install');
    for (const request of [
      new Request(origin + '/@vite/client'), new Request(origin + '/src/main.ts?t=1'),
      new Request(origin + '/sw.js'), new Request(origin + '/harness/cars.html'),
      new Request('https://other.test/assets/game-123.js'), new Request(origin + '/', { method: 'POST' }),
    ]) expect(await w.dispatch('fetch', { request })).toBeUndefined();
  });
});
