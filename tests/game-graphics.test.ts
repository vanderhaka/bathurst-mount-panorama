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
  const stage = { scene: new THREE.Scene(), renderer: {}, setQuality: vi.fn(), refreshEnvironment: vi.fn() };
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
    for (let i = 0; i < 20; i++) s.graphics.sample(0.1, 0);
    await vi.waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ quality: 'medium', pixelRatio: 1.5, automatic: true }));
    expect(s.changed).toHaveBeenCalledWith(expect.objectContaining({ quality: 'medium', autoQuality: true }));
    expect(s.notify).toHaveBeenCalledWith(expect.stringContaining('Settings'));
  });
});
