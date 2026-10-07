/** Only this initial boot can request an update. A later install waits for the next start. */
export function activateAtStart(container: ServiceWorkerContainer, worker: ServiceWorker, reload: () => void): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let finished = false;
    const finish = (ready: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      container.removeEventListener('controllerchange', changed);
      channel.port1.close();
      channel.port2.close();
      resolve(ready);
    };
    const changed = (): void => { if (!finished) { finish(false); reload(); } };
    const timeout = setTimeout(() => finish(true), 5_000);
    container.addEventListener('controllerchange', changed);
    channel.port1.onmessage = (event) => { if (event.data === 'defer') finish(true); };
    try { worker.postMessage({ type: 'ACTIVATE_AT_START' }, [channel.port2]); }
    catch { finish(true); }
  });
}

/** Quiet best-effort registration; an offline/unsupported browser uses its current version. */
export async function prepareOfflineGame(development = import.meta.env.DEV): Promise<boolean> {
  if (development || typeof navigator === 'undefined' || navigator.onLine === false || !('serviceWorker' in navigator) || !globalThis.isSecureContext) return true;
  try {
    const base = import.meta.env.BASE_URL;
    const container = navigator.serviceWorker;
    const registration = await container.register(base + 'sw.js', { scope: base, updateViaCache: 'none' });
    // Snapshot only the worker already waiting at boot. No runtime updatefound listener.
    const waiting = registration.waiting;
    return waiting ? await activateAtStart(container, waiting, () => location.reload()) : true;
  } catch { return true; }
}
