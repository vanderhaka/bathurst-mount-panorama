import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import shootout from '../api/shootout';

it('retires the old board, lap submissions and practice requests without forwarding them', async () => {
  const request = fetch;
  const upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
  const server = createServer(shootout);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unable to listen on a local port.');
    const url = `http://127.0.0.1:${address.port}/api/shootout`;

    for (const options of [
      { method: 'GET' },
      { method: 'HEAD' },
      { method: 'OPTIONS' },
      ...['start', 'submit', 'practice'].map((action) => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })),
    ]) {
      const response = await request(url, { ...options, redirect: 'manual' });
      expect(response.status).toBe(410);
      expect(response.headers.get('Location')).toBeNull();
      const read = options.method === 'GET' || options.method === 'HEAD';
      expect(response.headers.get('Cache-Control')).toBe(read ? 'public, max-age=0, s-maxage=300' : 'no-store');
      if (options.method === 'HEAD') expect(await response.text()).toBe('');
      else expect(await response.json()).toEqual({ error: expect.stringContaining('racinglive.app/game/ to play Live Racing') });
    }
    expect(upstream).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    vi.unstubAllGlobals();
  }
});
