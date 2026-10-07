import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { crowdSeats, buildCrowdDetail, CROWD_DETAIL_PRESETS } from '@/world/crowd-detail';

describe('grandstand crowd detail', () => {
  const options = { length: 36, rows: 12, density: 0.7, roof: false, seed: 93, maxTriangles: 7000 };
  it('preserves the existing seat pitch and leaves aisle gaps', () => {
    const seats = crowdSeats(options);
    expect(seats).toEqual(crowdSeats(options));
    expect(seats.length).toBeGreaterThan(100);
    const aisle = 1.2, blocks = 3, blockWidth = (36 - aisle * (blocks + 1)) / blocks;
    for (const seat of seats) {
      const local = seat.x + 18 - aisle;
      const block = Math.floor(local / (blockWidth + aisle));
      expect(block).toBeGreaterThanOrEqual(0);
      expect(block).toBeLessThan(blocks);
      expect(local - block * (blockWidth + aisle)).toBeLessThan(blockWidth);
      expect(seat.y).toBeCloseTo(1.4 + seat.row * 0.42 + 0.42);
    }
    expect(crowdSeats({ ...options, density: 0 })).toHaveLength(0);
  });

  it('has varied clothing, skin, heights, poses and accessories without roof umbrellas', () => {
    const seats = crowdSeats(options);
    expect(new Set(seats.map(s => s.shirt)).size).toBeGreaterThan(5);
    expect(new Set(seats.map(s => s.skin)).size).toBeGreaterThan(2);
    expect(new Set(seats.map(s => s.scale)).size).toBeGreaterThan(20);
    expect(new Set(seats.map(s => s.pose)).size).toBeGreaterThan(1);
    expect(seats.some(s => s.accessory === 'flag')).toBe(true);
    expect(seats.some(s => s.accessory === 'umbrella')).toBe(true);
    expect(crowdSeats({ ...options, roof: true }).some(s => s.accessory === 'umbrella')).toBe(false);
  });

  it('honours the structure triangle allowance and distributes a capped crowd across rows', () => {
    const crowd = buildCrowdDetail({ ...options, maxTriangles: 900 }, CROWD_DETAIL_PRESETS.high);
    expect(crowd.triangles).toBeLessThanOrEqual(900);
    expect(crowd.people).toBeGreaterThan(10);
    const geometry = crowd.mesh.geometry;
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.getAttribute('detailMotion').count).toBe(geometry.getAttribute('position').count);
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeGreaterThan(3);
    expect((crowd.mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
    expect(crowd.mesh.castShadow).toBe(false);
    crowd.dispose();
  });

  it('moves gently through High shader uniforms with a live off switch and static geometry', () => {
    const crowd = buildCrowdDetail(options, CROWD_DETAIL_PRESETS.high);
    const before = (crowd.mesh.geometry.getAttribute('position').array as Float32Array).slice();
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
    const mat = crowd.mesh.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('detailMotion.x');
    expect(shader.uniforms.uDetailAmplitude.value).toBeGreaterThan(0);
    crowd.update(14);
    expect(shader.uniforms.uDetailTime.value).toBe(14);
    crowd.setMotion(0);
    expect(shader.uniforms.uDetailAmplitude.value).toBe(0);
    expect(crowd.mesh.geometry.getAttribute('position').array).toEqual(before);
    crowd.dispose();
    const staticCrowd = buildCrowdDetail(options, CROWD_DETAIL_PRESETS.medium);
    expect(staticCrowd.motionAmplitude).toBe(0);
    staticCrowd.dispose();
  });
});
