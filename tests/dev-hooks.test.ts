import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/game';

vi.mock('@/input/touch-guards', () => ({ installTouchGuards: vi.fn() }));
vi.mock('@/phone/android-presentation', async (load) => ({
  ...await load<typeof import('@/phone/android-presentation')>(), installAndroidPresentation: vi.fn(),
}));
// A production build: dev tools off.
vi.mock('@/config/build-flags', () => ({ DEV_TOOLS: false, USAGE_ANALYTICS: false }));

describe('verification hooks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps window.__game (time scale, teleport, autopilot) out of production builds', async () => {
    const root = new EventTarget();
    vi.stubGlobal('document', { title: '', getElementById: (id: string) => (id === 'game' ? root : null), createElement: () => ({ getContext: () => ({}) }) });
    vi.stubGlobal('window', {});
    const create = vi.spyOn(Game, 'create').mockResolvedValue({ halt: vi.fn() } as unknown as Game);
    await import('@/main');
    expect(create).toHaveBeenCalledWith(root);
    await vi.waitFor(() => expect((window as { __shotReady?: boolean }).__shotReady).toBe(true));
    expect((window as { __game?: unknown }).__game).toBeUndefined();
  });
});
