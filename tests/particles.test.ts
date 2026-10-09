import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Particles } from '@/fx/particles';

describe('bounded particle batches', () => {
  it('uses seeded generated billboards, keeps a hard cap, and uploads only living data', () => {
    const scene = new THREE.Scene(), a = new Particles(scene, { capacity: 24, seed: 31 });
    const b = new Particles(new THREE.Scene(), { capacity: 24, seed: 31 });
    for (const particles of [a, b]) {
      for (let i = 0; i < 80; i++) particles.emit(i % 2 ? 'smoke' : 'spark', 2, 1, 3, 10, 0, 20, 0.8);
      particles.update(1 / 60);
      expect(particles.snapshot().particles.length).toBeLessThanOrEqual(24);
      expect(particles.meshes.length).toBe(2);
      for (const mesh of particles.meshes) {
        const g = mesh.geometry as THREE.InstancedBufferGeometry;
        expect((g.index?.count ?? g.getAttribute('position').count) / 3).toBe(2);
        expect(g.instanceCount).toBeLessThanOrEqual(24);
        expect((mesh.material as THREE.ShaderMaterial).depthWrite).toBe(false);
      }
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    a.configure({ smoke: false });
    expect(a.snapshot().particles.some((p) => p.kind === 'smoke')).toBe(false);
    a.dispose(); b.dispose();
  });

  it('expires puffs, preserves paused state and has deterministic reset plus full disposal', () => {
    const scene = new THREE.Scene(), particles = new Particles(scene, { capacity: 32, seed: 7 });
    particles.emit('dust', 0, 0, 0, 10, 0, 0); particles.update(0.05);
    const before = particles.snapshot(); particles.update(0); expect(particles.snapshot()).toEqual(before);
    for (let i = 0; i < 30; i++) particles.update(0.1);
    expect(particles.snapshot().particles).toEqual([]);
    particles.reset(9); particles.emit('flame', 0, 1, 0, 0, 0, 0);
    const sample = particles.snapshot(); particles.reset(9); particles.emit('flame', 0, 1, 0, 0, 0, 0);
    expect(particles.snapshot()).toEqual(sample);
    let disposed = 0;
    for (const mesh of particles.meshes) { mesh.geometry.addEventListener('dispose', () => disposed++); (mesh.material as THREE.Material).addEventListener('dispose', () => disposed++); }
    particles.dispose(); particles.dispose(); expect(disposed).toBe(4); expect(scene.children).toEqual([]);
  });

  it('draws a new particle where it was emitted, then moves it from the next frame on', () => {
    const particles = new Particles(new THREE.Scene(), { seed: 5 });
    particles.emit('flame', 1, 0.3, 2, 0, 0, 56, 1, { x: 0, y: 0, z: -1 });
    particles.update(1 / 60);
    const [born] = particles.snapshot().particles;
    expect([born.x, born.y, born.z]).toEqual([1, 0.3, 2]);
    particles.update(1 / 60);
    expect(particles.snapshot().particles[0].z).toBeGreaterThan(2.5);
    particles.dispose();
  });
});
