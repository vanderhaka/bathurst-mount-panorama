import { describe, expect, it, vi } from 'vitest';
import { requestAndroidPresentation } from '@/phone/android-presentation';

describe('Android presentation', () => {
  it('enters fullscreen in the tap handler, then locks landscape', async () => {
    const order: string[] = [];
    const host = { requestFullscreen: vi.fn(() => { order.push('fullscreen'); return Promise.resolve(); }) };
    const orientation = { lock: vi.fn(async () => { order.push('landscape'); }) };
    const pending = requestAndroidPresentation('Mozilla Android Chrome', host, orientation);
    expect(order).toEqual(['fullscreen']);
    await pending; expect(order).toEqual(['fullscreen', 'landscape']);
    expect(orientation.lock).toHaveBeenCalledExactlyOnceWith('landscape');
  });
  it('leaves iPhone alone and tolerates unavailable or rejected browser APIs', async () => {
    const host = { requestFullscreen: vi.fn().mockRejectedValue(new Error('Denied')) };
    const orientation = { lock: vi.fn() };
    await requestAndroidPresentation('Mozilla iPhone Safari', host, orientation);
    expect(host.requestFullscreen).not.toHaveBeenCalled();
    await requestAndroidPresentation('Android', host, orientation);
    expect(orientation.lock).not.toHaveBeenCalled();
    await requestAndroidPresentation('Android', {}, {});
  });
});
