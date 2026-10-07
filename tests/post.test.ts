import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
const aoState = vi.hoisted(() => ({ imports: 0, instances: [] as { render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn>; setGBuffer: ReturnType<typeof vi.fn> }[] }));
vi.mock('three/addons/postprocessing/GTAOPass.js', () => {
  aoState.imports++;
  return ({
  GTAOPass: class {
    static OUTPUT = { Off: -1 };
    gtaoMap = new THREE.Texture();
    render = vi.fn(); dispose = vi.fn(); setSize = vi.fn();
    updateGtaoMaterial = vi.fn(); updatePdMaterial = vi.fn(); setGBuffer = vi.fn();
    constructor() { aoState.instances.push(this); }
  },
});
});
import { DEFAULT_GRAPHICS } from '@/config/graphics';
import { createPostChain } from '@/render/post';

function mockRenderer() {
  const info = { autoReset: true, render: { calls: 0 }, reset() { this.render.calls = 0; } };
  const rendered: (THREE.WebGLRenderTarget | null)[] = [];
  let target: THREE.WebGLRenderTarget | null = null;
  const renderer = {
    info,
    getDrawingBufferSize: (value: THREE.Vector2) => value.set(1920, 1080),
    getPixelRatio: () => 1,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { target = next; },
    render: () => {
      if (info.autoReset) info.reset();
      info.render.calls++;
      rendered.push(target);
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, info, rendered };
}

describe('HDR post pipeline', () => {
  it('never imports or allocates AO for a phone tier', async () => {
    const { renderer } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 2, false, false);
    const count = aoState.instances.length;
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    await vi.dynamicImportSettled();
    expect(aoState.instances.length).toBe(count);
    expect(aoState.imports).toBe(0);
    post.dispose();
  });

  it('releases the scene target on Low and restores the latest drawing-buffer size on re-enable', () => {
    const { renderer, rendered } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 2);
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    const old = rendered[0]!;
    const disposed = vi.fn(); old.addEventListener('dispose', disposed);
    post.setEnabled(false, 2);
    expect(disposed).toHaveBeenCalledOnce();
    post.setSize(960, 540);
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(rendered.at(-1)).toBeNull();
    post.setEnabled(true, 2);
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    const restored = rendered.at(-2)!;
    expect(restored).not.toBe(old);
    expect([restored.width, restored.height, restored.samples]).toEqual([960, 540, 2]);
    post.dispose();
  });

  it('does not revive a pending AO allocation after stepping down to Medium', async () => {
    const { renderer } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 4, false, true);
    const count = aoState.instances.length;
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    post.setEnabled(true, 2, false, false);
    await vi.dynamicImportSettled();
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(aoState.instances.length).toBe(count);
    post.dispose();
  });
  it('reuses the visible scene depth so wind and cutout leaves contribute their real silhouette', async () => {
    const { renderer, rendered } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 4, false, true);
    post.apply({ ...DEFAULT_GRAPHICS, screenAo: 0.5 });
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    await vi.dynamicImportSettled();
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    const depth = rendered[0]?.depthTexture;
    expect(depth).toBeInstanceOf(THREE.DepthTexture);
    expect(aoState.instances.at(-1)!.setGBuffer).toHaveBeenCalledWith(depth);
    expect(rendered[0]?.resolveDepthBuffer).toBe(true);
    post.dispose();
  });
  it('allocates half-size High AO lazily and releases it on a tier step-down', async () => {
    const { renderer } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 4, true, true);
    post.apply({ ...DEFAULT_GRAPHICS, screenAo: 0.5 });
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    post.render(scene, camera);
    await vi.dynamicImportSettled();
    post.render(scene, camera);
    const ao = aoState.instances.at(-1)!;
    expect(ao.setSize).toHaveBeenCalledWith(960, 540);
    expect(ao.render).toHaveBeenCalled();
    post.setEnabled(true, 4, false, false);
    expect(ao.dispose).toHaveBeenCalledOnce();
    post.dispose();
  });
  it('reports every draw in the frame, including the High bloom passes', () => {
    const { renderer, info, rendered } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 4, true);
    post.apply(DEFAULT_GRAPHICS);
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(info.render.calls).toBe(4);
    expect(info.autoReset).toBe(true);
    expect(rendered[1]?.width).toBe(480);
    expect(rendered[2]?.height).toBe(270);
    post.dispose();
  });

  it('disposes High bloom buffers when moving to Medium', () => {
    const { renderer, info, rendered } = mockRenderer();
    const post = createPostChain(renderer);
    post.setEnabled(true, 4, true);
    post.apply(DEFAULT_GRAPHICS);
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    let disposed = 0;
    rendered[1]?.addEventListener('dispose', () => disposed++);
    rendered[2]?.addEventListener('dispose', () => disposed++);
    post.setEnabled(true, 4, false);
    post.render(new THREE.Scene(), new THREE.PerspectiveCamera());
    expect(disposed).toBe(2);
    expect(info.render.calls).toBe(2);
    post.dispose();
  });
});
