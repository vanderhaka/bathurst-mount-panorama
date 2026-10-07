import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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
