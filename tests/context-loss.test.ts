import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '@/game/game';
import { RealLapClock } from '@/game/shootout-rules';
import { DEFAULT_SETTINGS } from '@/types/session';

vi.mock('@/input/touch-guards', () => ({ installTouchGuards: vi.fn() }));
vi.mock('@/phone/android-presentation', async (load) => ({
  ...await load<typeof import('@/phone/android-presentation')>(), installAndroidPresentation: vi.fn(),
}));

/** The lifecycle members under test, private ones included (TypeScript privates are plain properties). */
interface Lifecycle { state: string; halt(): void; startRace(cfg: object): void; resume(): void; restart(): void }

/** Only the fields the pause path touches; the Node tests have no WebGL renderer. */
function fixture(state: 'race' | 'title') {
  const parts = {
    audio: { suspend: vi.fn(), resume: vi.fn() }, wakeLock: { setRunning: vi.fn() }, menus: { showPause: vi.fn() },
    graphics: { settle: vi.fn(), startRace: vi.fn() }, rig: { snap: vi.fn() }, applySettings: vi.fn(),
    race: { session: { placeOnGrid: vi.fn() }, profiles: { reset: vi.fn() } }, lapClock: new RealLapClock(),
  };
  const game = Object.assign(Object.create(Game.prototype) as object, { state, halted: false, ...parts }) as unknown as Lifecycle;
  return { game, ...parts };
}

describe('lost WebGL context', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pauses a running race through the pause path: wake lock and engine audio released', () => {
    const { game, audio, wakeLock, menus } = fixture('race');
    game.halt();
    expect(game.state).toBe('paused');
    expect(audio.suspend).toHaveBeenCalledOnce();
    expect(menus.showPause).toHaveBeenCalledOnce();
    expect(wakeLock.setRunning).toHaveBeenLastCalledWith(false);
  });

  it('keeps the race stopped: Resume, Restart and Start behind the reload note do nothing', () => {
    const { game, audio, race, applySettings } = fixture('race');
    game.halt();
    game.resume();
    game.restart();
    game.startRace({ car: 'camaro', liveryIndex: 0, tyres: 'soft', settings: DEFAULT_SETTINGS });
    expect(game.state).toBe('paused');
    expect(audio.resume).not.toHaveBeenCalled();
    expect(race.session.placeOnGrid).not.toHaveBeenCalled();
    expect(applySettings).not.toHaveBeenCalled();
  });

  it('leaves the title screen as it is', () => {
    const { game, audio, menus } = fixture('title');
    game.halt();
    expect(game.state).toBe('title');
    expect(audio.suspend).not.toHaveBeenCalled();
    expect(menus.showPause).not.toHaveBeenCalled();
  });

  it('main.ts halts the game in its context-lost handler and shows the reload note', async () => {
    const root = new EventTarget(), overlay = Object.assign(new EventTarget(), { style: { display: 'none' }, textContent: '' });
    vi.stubGlobal('document', { title: '', getElementById: (id: string) => ({ game: root, 'boot-error': overlay } as Record<string, unknown>)[id] ?? null,
      createElement: () => ({ getContext: () => ({}) }) });
    vi.stubGlobal('window', {});
    const game = { halt: vi.fn() };
    const create = vi.spyOn(Game, 'create').mockResolvedValue(game as unknown as Game);
    await import('@/main');
    expect(create).toHaveBeenCalledWith(root);
    await vi.waitFor(() => expect((window as { __game?: unknown }).__game).toBe(game));
    const lost = new Event('webglcontextlost', { cancelable: true });
    root.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(game.halt).toHaveBeenCalledOnce();
    expect(overlay.style.display).toBe('grid');
  });
});
