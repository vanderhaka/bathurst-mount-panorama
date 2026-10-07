import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { motionBlurAmount, sunInView } from '@/render/camera-effects';

describe('camera effects', () => {
  it('keeps motion sharp at low speeds, off and on phone tiers', () => {
    expect(motionBlurAmount(20, 1, true, true)).toBe(0);
    expect(motionBlurAmount(80, 1, false, true)).toBe(0);
    expect(motionBlurAmount(80, 1, true, false)).toBe(0);
    expect(motionBlurAmount(80, 0, true, true)).toBe(0);
    expect(motionBlurAmount(80, 1, true, true)).toBeGreaterThan(0);
    expect(motionBlurAmount(200, 100, true, true)).toBeLessThanOrEqual(0.002);
  });
  it('projects the sun only in front of the camera and within the viewport', () => {
    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 16000);
    camera.updateMatrixWorld();
    const inView = sunInView(camera, new THREE.Vector3(0, 0.1, -1));
    expect(inView.visible).toBe(true);
    expect(inView.uv.x).toBeCloseTo(0.5);
    expect(inView.uv.y).toBeGreaterThan(0.5);
    expect(sunInView(camera, new THREE.Vector3(0, 0, 1)).visible).toBe(false);
    expect(sunInView(camera, new THREE.Vector3(1, 0, -0.1)).visible).toBe(false);
    camera.position.set(800, 500, 300);
    camera.updateMatrixWorld();
    expect(sunInView(camera, new THREE.Vector3(0, 0.1, -1)).uv.y).toBeCloseTo(inView.uv.y);
  });
});
