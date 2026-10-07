import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateAtStart, prepareOfflineGame } from '@/offline/register';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

class Port {
  peer: Port | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  close = vi.fn();
  postMessage(data: unknown): void { queueMicrotask(() => this.peer?.onmessage?.({ data })); }
}
function channels(): void {
  vi.stubGlobal('MessageChannel', class {
    readonly port1 = new Port();
    readonly port2 = new Port();
    constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; }
  });
}

describe('startup-only service worker activation', () => {
  it('activates an already waiting worker before game boot and reloads exactly once on controller change', async () => {
    vi.useFakeTimers();
    channels();
    const container = new EventTarget();
    const postMessage = vi.fn();
    const reload = vi.fn();
    let settled = false;
    const ready = activateAtStart(container as unknown as ServiceWorkerContainer, { postMessage } as unknown as ServiceWorker, reload).then((value) => { settled = true; return value; });
    expect(postMessage.mock.calls[0][0]).toEqual({ type: 'ACTIVATE_AT_START' });
    expect(settled).toBe(false); // Game.create must not run while the cache version switches.
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(await ready).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the active version when another open game client defers activation', async () => {
    vi.useFakeTimers();
    channels();
    const container = new EventTarget();
    const reload = vi.fn();
    const worker = { postMessage: (_data: unknown, ports: Port[]) => ports[0].postMessage('defer') };
    expect(await activateAtStart(container as unknown as ServiceWorkerContainer, worker as unknown as ServiceWorker, reload)).toBe(true);
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resumes the current version after five seconds if activation never responds', async () => {
    vi.useFakeTimers();
    channels();
    const container = new EventTarget();
    const postMessage = vi.fn();
    const reload = vi.fn();
    let settled = false;
    const ready = activateAtStart(container as unknown as ServiceWorkerContainer, { postMessage } as unknown as ServiceWorker, reload).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(await ready).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const port = postMessage.mock.calls[0][1][0] as Port;
    expect(port.close).toHaveBeenCalledOnce();
    expect(port.peer?.close).toHaveBeenCalledOnce();
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not request activation for an install that completes after startup', async () => {
    const container = new EventTarget();
    const registration: { waiting: ServiceWorker | null } = { waiting: null };
    const register = vi.fn(async () => registration);
    vi.stubGlobal('navigator', { serviceWorker: Object.assign(container, { register }) });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('location', { href: 'https://game.test/', reload: vi.fn() });
    expect(await prepareOfflineGame(false)).toBe(true);
    const postMessage = vi.fn();
    registration.waiting = { postMessage } as unknown as ServiceWorker;
    container.dispatchEvent(new Event('updatefound'));
    container.dispatchEvent(new Event('statechange'));
    expect(postMessage).not.toHaveBeenCalled();
    expect(register.mock.calls[0]).toEqual(['/sw.js', { scope: '/', updateViaCache: 'none' }]);
  });

  it('keeps the active cached version on an offline startup even if a new worker is waiting', async () => {
    const postMessage = vi.fn();
    const register = vi.fn(async () => ({ waiting: { postMessage } }));
    vi.stubGlobal('navigator', { onLine: false, serviceWorker: { register } });
    vi.stubGlobal('isSecureContext', true);
    expect(await prepareOfflineGame(false)).toBe(true);
    expect(postMessage).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('skips development/HMR, absent APIs, insecure contexts and quiet registration failures', async () => {
    const register = vi.fn(async () => { throw new Error('offline'); });
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    vi.stubGlobal('isSecureContext', true);
    expect(await prepareOfflineGame(true)).toBe(true);
    expect(register).not.toHaveBeenCalled();
    vi.stubGlobal('isSecureContext', false);
    expect(await prepareOfflineGame(false)).toBe(true);
    expect(register).not.toHaveBeenCalled();
    vi.stubGlobal('isSecureContext', true);
    expect(await prepareOfflineGame(false)).toBe(true);
    vi.stubGlobal('navigator', {});
    expect(await prepareOfflineGame(false)).toBe(true);
  });
});
