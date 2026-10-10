import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { capPixelRatio, MAX_BUFFER_PIXELS } from '@/render/pixel-density';
import { createSky, SKY_RENDER_ORDER } from '@/world/sky';
import { createSkyEnvironment } from '@/world/lighting';

describe('pixel cap for very large canvases', () => {
  it('leaves laptop, 1440p and 4K displays at their tier ratio', () => {
    expect(capPixelRatio(2, 1512, 982)).toBe(2);
    expect(capPixelRatio(2, 1728, 1117)).toBe(2);
    expect(capPixelRatio(1.5, 2560, 1440)).toBe(1.5);
    expect(capPixelRatio(2, 1920, 1080)).toBe(2);
  });

  it('caps a 5K display at 2x to the pixels of a 3840x2160 buffer', () => {
    const ratio = capPixelRatio(2, 2560, 1440);
    expect(ratio).toBeCloseTo(1.5, 5);
    expect(2560 * 1440 * ratio * ratio).toBeLessThanOrEqual(MAX_BUFFER_PIXELS + 1);
  });

  it('never takes a display below 1x', () => {
    expect(capPixelRatio(1, 5120, 2880)).toBe(1);
    expect(capPixelRatio(2, 5120, 2880)).toBe(1);
  });
});

describe('sky overdraw', () => {
  it('draws both domes after the opaque scene with a far-plane depth test', () => {
    for (const quality of ['high', 'low'] as const) {
      const scene = new THREE.Scene();
      const sky = createSky(scene, 9000, quality);
      const material = sky.dome.material as THREE.ShaderMaterial;
      expect(sky.dome.renderOrder).toBe(SKY_RENDER_ORDER);
      expect(material.depthTest).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.transparent).toBe(false);
      // Both shaders put the dome at the far plane, so the default LessEqual test passes only where nothing was drawn.
      expect(material.vertexShader).toMatch(/gl_Position\.z = gl_Position\.w|xyww/);
    }
  });

  it('keeps the environment capture as before: sky backdrop first, no depth test, restored afterwards', () => {
    const scene = new THREE.Scene();
    const sky = createSky(scene, 9000, 'high');
    const material = sky.dome.material as THREE.ShaderMaterial;
    const seen: { order: number; depthTest: boolean }[] = [];
    const renderer = {} as THREE.WebGLRenderer;
    const { fromScene, dispose } = THREE.PMREMGenerator.prototype;
    THREE.PMREMGenerator.prototype.fromScene = function (env: THREE.Scene) {
      env.traverse(o => { if (o.name === 'sky-dome') seen.push({ order: o.renderOrder, depthTest: material.depthTest }); });
      return new THREE.WebGLRenderTarget(1, 1);
    };
    THREE.PMREMGenerator.prototype.dispose = () => {};
    try { createSkyEnvironment(renderer, sky.dome, 'high', null); }
    finally { Object.assign(THREE.PMREMGenerator.prototype, { fromScene, dispose }); }
    expect(seen).toEqual([{ order: -10, depthTest: false }]);
    expect(material.depthTest).toBe(true);
  });

  it('enables HDRI and probes only on Medium and High', async () => {
    const { QUALITY } = await import('@/config/graphics');
    expect(QUALITY.low.hdriEnv).toBe(false);
    expect(QUALITY.low.reflectionProbes).toBe(0);
    expect(QUALITY.medium.hdriEnv).toBe(true);
    expect(QUALITY.medium.reflectionProbes).toBeGreaterThan(0);
    expect(QUALITY.high.reflectionProbes).toBeGreaterThan(QUALITY.medium.reflectionProbes);
  });
});
