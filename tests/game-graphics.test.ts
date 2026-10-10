import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameGraphics } from '@/game/game-graphics';
import type { Stage } from '@/game/stage';
import type { CarModel } from '@/types/car-model';
import { DEFAULT_SETTINGS } from '@/types/session';
import type { World } from '@/world/world';

const mocks = vi.hoisted(() => ({ build: vi.fn(), dispose: vi.fn(), save: vi.fn() }));
vi.mock('@/world/world', () => ({ buildWorld: mocks.build, disposeWorld: mocks.dispose }));
vi.mock('@/game/quality-store', () => ({
  loadQualityChoice: () => ({ quality: 'high', pixelRatio: 2, automatic: true }),
  saveQualityChoice: mocks.save,
  qualityFromSettings: (s: typeof DEFAULT_SETTINGS, p: { pixelRatio: number }) => ({ quality: s.quality, pixelRatio: s.quality === 'low' ? 1 : s.quality === 'medium' ? 1.5 : p.pixelRatio, automatic: s.autoQuality }),
}));

function world(name: string): World {
  const root = new THREE.Group(); root.name = name;
  return { root, track: {}, line: {}, profile: {}, kerbs: {} } as unknown as World;
}

function setup() {
  let current = world('original');
  const original = current;
  const stage = { scene: new THREE.Scene(), renderer: {}, setQuality: vi.fn(), refreshEnvironment: vi.fn(), precompile: vi.fn(async () => {}), scalable: false, setRenderScale: vi.fn(), takeGpuSeconds: () => null };
  stage.scene.add(current.root);
  const models = [0, 1, 2].map(() => ({ setQuality: vi.fn() }));
  const changed = vi.fn(), notify = vi.fn();
  const graphics = new GameGraphics(stage as unknown as Stage, { ...DEFAULT_SETTINGS }, {
    world: () => current, replaceWorld: (next) => { current = next; },
    models: () => models as unknown as CarModel[], changed, notify,
  });
  return { graphics, stage, models, changed, notify, original, current: () => current };
}

beforeEach(() => vi.clearAllMocks());

describe('tier changes rebuild live visual resources', () => {
  it('rebuilds world maps and all current car maps, retaining the physical track references', async () => {
    const s = setup(), next = world('medium');
    mocks.build.mockResolvedValueOnce(next);
    await s.graphics.applySettings({ ...DEFAULT_SETTINGS, quality: 'medium', autoQuality: false });
    expect(s.stage.setQuality).toHaveBeenCalledWith('medium', 1.5);
    expect(mocks.build).toHaveBeenCalledWith(s.stage.renderer, expect.any(Function), 'medium', s.original);
    for (const model of s.models) expect(model.setQuality).toHaveBeenCalledWith('medium');
    expect(s.current()).toBe(next);
    expect(s.stage.scene.children).toContain(next.root);
    expect(s.stage.scene.children).not.toContain(s.original.root);
    expect(mocks.dispose).toHaveBeenCalledWith(s.original, next);
  });

  it('disposes a stale in-flight world and then builds the latest requested tier', async () => {
    const s = setup(), stale = world('medium'), latest = world('low');
    let finish: (w: World) => void = () => {};
    mocks.build.mockImplementationOnce(() => new Promise<World>((r) => { finish = r; })).mockResolvedValueOnce(latest);
    const first = s.graphics.applySettings({ ...DEFAULT_SETTINGS, quality: 'medium', autoQuality: false });
    const second = s.graphics.applySettings({ ...DEFAULT_SETTINGS, quality: 'low', autoQuality: false });
    finish(stale);
    await Promise.all([first, second]);
    expect(mocks.dispose).toHaveBeenCalledWith(stale, s.original);
    expect(mocks.build.mock.calls.map((c) => c[2])).toEqual(['medium', 'low']);
    expect(s.current()).toBe(latest);
  });

  it('retains the current world after a failed rebuild and allows a later retry', async () => {
    const s = setup();
    mocks.build.mockRejectedValueOnce(new Error('allocation failed'));
    await s.graphics.applySettings({ ...DEFAULT_SETTINGS, quality: 'medium', autoQuality: false });
    expect(s.current()).toBe(s.original);
    expect(mocks.dispose).not.toHaveBeenCalledWith(s.original);
    expect(s.notify).toHaveBeenCalled();
    const next = world('retry'); mocks.build.mockResolvedValueOnce(next);
    await s.graphics.rebuildWorld();
    expect(s.current()).toBe(next);
  });

  it('persists an automatic result, synchronizes Settings and shows the player a note', async () => {
    const s = setup(); mocks.build.mockResolvedValueOnce(world('medium'));
    s.graphics.startRace();
    feed(s.graphics, 5, 0.1);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ quality: 'medium', pixelRatio: 1.5, automatic: true }));
    expect(s.changed).toHaveBeenCalledWith(expect.objectContaining({ quality: 'medium', autoQuality: true }));
    expect(s.notify).toHaveBeenCalledWith(expect.stringContaining('Settings'));
  });
});

function feed(graphics: GameGraphics, seconds: number, interval: number): void {
  for (let i = 0, n = Math.round(seconds / interval); i < n; i++) graphics.sample(interval, 0);
}

describe('automatic quality evidence around rebuilds', () => {
  it('keeps High through a 350 ms first race frame, steady 60 fps and a 3.5 s block', () => {
    const s = setup();
    s.graphics.startRace();
    s.graphics.sample(0.35, 0);
    feed(s.graphics, 5, 1 / 60);
    s.graphics.sample(3.5, 0);
    feed(s.graphics, 25, 1 / 60);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
    expect(s.changed).not.toHaveBeenCalled();
  });

  it('ignores every frame while a rebuild is in flight, including the rebuild block after it lands', async () => {
    const s = setup();
    let finish: (w: World) => void = () => {};
    mocks.build.mockImplementationOnce(() => new Promise<World>((r) => { finish = r; }));
    s.graphics.startRace();
    feed(s.graphics, 5, 1 / 40);
    expect(mocks.save.mock.calls).toEqual([[{ quality: 'medium', pixelRatio: 1.5, automatic: true }]]);
    feed(s.graphics, 60, 1 / 40);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    finish(world('medium'));
    await vi.waitFor(() => expect(s.current().root.name).toBe('medium'));
    s.graphics.sample(3.5, 0);
    feed(s.graphics, 20, 1 / 50);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(s.changed).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh verdict once a rebuild lands', async () => {
    const s = setup();
    s.graphics.startRace();
    feed(s.graphics, 3, 1 / 40); // warm-up and one over-budget window
    mocks.build.mockResolvedValueOnce(world('tuned'));
    await s.graphics.rebuildWorld();
    feed(s.graphics, 3, 1 / 40);
    expect(mocks.save).not.toHaveBeenCalled();
    feed(s.graphics, 2, 1 / 40);
    expect(mocks.save).toHaveBeenCalledWith({ quality: 'medium', pixelRatio: 1.5, automatic: true });
  });

  it('ignores the first second after the race resumes', () => {
    const s = setup();
    s.graphics.startRace();
    feed(s.graphics, 3, 1 / 40);
    s.graphics.settle();
    feed(s.graphics, 1, 0.2);
    feed(s.graphics, 3, 1 / 40);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('never changes or saves a manual choice', async () => {
    const s = setup();
    await s.graphics.applySettings({ ...DEFAULT_SETTINGS, quality: 'high', autoQuality: false });
    vi.clearAllMocks();
    s.graphics.startRace();
    feed(s.graphics, 30, 0.1);
    feed(s.graphics, 10, 0.3);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(s.changed).not.toHaveBeenCalled();
    expect(s.stage.setQuality).not.toHaveBeenCalled();
  });
});

describe('dynamic resolution on automatic tiers', () => {
  const scalable = (s: ReturnType<typeof setup>) => { s.stage.scalable = true; return s; };

  it('lowers the scene scale on a small deficit instead of stepping the tier', () => {
    const s = scalable(setup());
    s.graphics.startRace();
    feed(s.graphics, 3, 1 / 52);
    expect(Math.min(...s.stage.setRenderScale.mock.calls.map(c => c[0] as number))).toBeLessThan(1);
    // The smaller scene target brings the frames back to budget.
    feed(s.graphics, 10, 1 / 60);
    expect(s.stage.setQuality).not.toHaveBeenCalled();
  });

  it('still steps the tier within the observation when the lowest scale cannot keep up', () => {
    const s = scalable(setup());
    mocks.build.mockResolvedValueOnce(world('medium'));
    s.graphics.startRace();
    feed(s.graphics, 10, 1 / 52);
    expect(s.stage.setRenderScale).toHaveBeenCalledWith(0.7);
    expect(s.stage.setQuality).toHaveBeenCalledWith('medium', 1.5);
  });

  it('restores full resolution for the menus', () => {
    const s = scalable(setup());
    s.graphics.startRace();
    feed(s.graphics, 3, 1 / 52);
    s.stage.setRenderScale.mockClear();
    s.graphics.endRace();
    expect(s.stage.setRenderScale).toHaveBeenCalledWith(1);
  });

  it('never scales a manual tier', async () => {
    const s = scalable(setup());
    await s.graphics.applySettings({ ...DEFAULT_SETTINGS, quality: 'high', autoQuality: false });
    s.graphics.startRace();
    feed(s.graphics, 10, 1 / 40);
    expect(s.stage.setRenderScale).not.toHaveBeenCalled();
  });
});
