/// <reference lib="webworker" />

export interface OfflineManifest {
  cacheName: string;
  rootPath: string;
  files: string[];
}

/** Kept self-contained so the build emits one classic worker with the actual asset list. */
function workerRuntime(config: OfflineManifest): void {
  const sw = globalThis as unknown as ServiceWorkerGlobalScope;
  const files = new Set(config.files);
  const absolute = (path: string): string => new URL(path, sw.registration.scope).href;

  sw.addEventListener('install', (event) => {
    event.waitUntil((async () => {
      try {
        const cache = await sw.caches.open(config.cacheName);
        await cache.addAll(config.files.map((path) => new Request(absolute(path), { cache: path.includes('/assets/') ? 'default' : 'reload' })));
      } catch (error) {
        await sw.caches.delete(config.cacheName);
        throw error;
      }
      // Never skip waiting here: installation can finish in the middle of a race.
    })());
  });

  sw.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      for (const name of await sw.caches.keys()) if (name.startsWith('bathurst-game-') && name !== config.cacheName) await sw.caches.delete(name);
      await sw.clients.claim();
    })());
  });

  sw.addEventListener('message', (event) => {
    if (event.data?.type !== 'ACTIVATE_AT_START' || !event.source || !('id' in event.source)) return;
    const sourceId = event.source.id;
    event.waitUntil((async () => {
      const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // A reload of this bootstrap must not replace the worker of another running game.
      if (clients.some((client) => client.url.startsWith(sw.registration.scope) && client.id !== sourceId)) {
        event.ports[0]?.postMessage('defer');
        return;
      }
      await sw.skipWaiting();
    })());
  });

  sw.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== sw.location.origin || !files.has(url.pathname)) return;
    const root = url.pathname === config.rootPath || url.pathname === config.rootPath + 'index.html';
    event.respondWith((async () => {
      // Online navigation sees a new build (or Vite HMR); never mix it into this version's cache.
      if (root) {
        try { const response = await sw.fetch(request); if (response.ok) return response; } catch { /* Offline. */ }
      }
      const cached = await (await sw.caches.open(config.cacheName)).match(absolute(root ? config.rootPath + 'index.html' : url.pathname));
      return cached ?? sw.fetch(request);
    })());
  });
}

export function createWorkerSource(config: OfflineManifest): string {
  return `(${workerRuntime.toString()})(${JSON.stringify(config)});\n`;
}

/** Included in the content version so a worker-policy change creates a fresh cache too. */
export function workerCode(): string { return workerRuntime.toString(); }
