import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentOnRaceTaps, requestAndroidPresentation } from '@/phone/android-presentation';
import type { MenuCallbacks } from '@/types/hud';
import { DEFAULT_SETTINGS } from '@/types/session';

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

describe('Start, Resume and Restart taps after fullscreen was left', () => {
  afterEach(() => vi.unstubAllGlobals());

  function phone(userAgent: string) {
    const order: string[] = [];
    const page = { fullscreenElement: null as object | null,
      documentElement: { requestFullscreen: vi.fn(() => { order.push('fullscreen'); return Promise.resolve(); }) } };
    vi.stubGlobal('document', page);
    vi.stubGlobal('navigator', { userAgent });
    vi.stubGlobal('screen', { orientation: { lock: vi.fn(() => Promise.reject(new Error('NotSupported'))) } });
    const callbacks = {
      onStart: vi.fn(() => order.push('start')), onResume: vi.fn(() => order.push('resume')),
      onRestart: vi.fn(() => order.push('restart')), onResetCar: vi.fn(),
    } as unknown as MenuCallbacks;
    return { order, page, callbacks, wrapped: presentOnRaceTaps(callbacks) };
  }

  it('re-requests fullscreen inside each tap, before the game starts or resumes', () => {
    const { order, page, wrapped } = phone('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile');
    wrapped.onStart({ car: 'camaro', liveryIndex: 0, tyres: 'soft', settings: DEFAULT_SETTINGS });
    wrapped.onResume();
    wrapped.onRestart();
    expect(order).toEqual(['fullscreen', 'start', 'fullscreen', 'resume', 'fullscreen', 'restart']);
    expect(page.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('skips the request while still fullscreen and passes other actions through', () => {
    const { order, page, callbacks, wrapped } = phone('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile');
    page.fullscreenElement = page.documentElement;
    wrapped.onResume();
    wrapped.onResetCar();
    expect(order).toEqual(['resume']);
    expect(callbacks.onResetCar).toHaveBeenCalledOnce();
  });

  it('never requests fullscreen on iPhone and survives a refused request', async () => {
    const iphone = phone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    iphone.wrapped.onResume();
    expect(iphone.order).toEqual(['resume']);
    const android = phone('Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile');
    android.page.documentElement.requestFullscreen.mockRejectedValueOnce(new Error('Permissions check failed'));
    android.wrapped.onResume();
    await Promise.resolve();
    expect(android.order).toEqual(['resume']);
  });
});
