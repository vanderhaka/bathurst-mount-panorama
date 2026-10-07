import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ instances: [] as { dispose: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> }[], fail: false }));
vi.mock('three/addons/postprocessing/SMAAPass.js', () => ({ SMAAPass: class {
  dispose = vi.fn(); setSize = vi.fn(); render = vi.fn();
  constructor() { if (state.fail) throw new Error('Unavailable'); state.instances.push(this); }
} }));
import { CameraAntialias } from '@/render/antialias';

describe('lazy High SMAA', () => {
  it('loads only when requested, follows resizing and releases its owned buffers on step-down', async () => {
    const aa = new CameraAntialias(), target = new THREE.WebGLRenderTarget(100, 50);
    const renderer = {} as THREE.WebGLRenderer;
    aa.configure(false, 100, 50);
    expect(aa.render(renderer, target)).toBe(target.texture);
    aa.configure(true, 100, 50); await vi.dynamicImportSettled();
    const pass = state.instances.at(-1)!;
    expect(pass.setSize).toHaveBeenCalledWith(100, 50);
    aa.configure(true, 200, 100);
    expect(pass.setSize).toHaveBeenLastCalledWith(200, 100);
    expect(aa.render(renderer, target)).not.toBe(target.texture);
    expect(pass.render).toHaveBeenCalledOnce();
    aa.configure(false, 200, 100); aa.dispose();
    expect(pass.dispose).toHaveBeenCalledOnce();
    expect(aa.render(renderer, target)).toBe(target.texture);
  });
  it('does not allocate stale targets when disposed during loading', async () => {
    const count = state.instances.length, aa = new CameraAntialias();
    aa.configure(true, 100, 50); aa.dispose(); await vi.dynamicImportSettled();
    expect(state.instances).toHaveLength(count);
  });
  it('continues with MSAA if the optional pass cannot load', async () => {
    state.fail = true;
    const aa = new CameraAntialias(), target = new THREE.WebGLRenderTarget(100, 50);
    aa.configure(true, 100, 50); await vi.dynamicImportSettled();
    expect(aa.render({} as THREE.WebGLRenderer, target)).toBe(target.texture);
    aa.dispose(); state.fail = false;
  });
});
