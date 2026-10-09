import * as THREE from 'three';
import { SUN_DIRECTION } from '@/world/sky';
import { createRng, type Rng } from '@/props/core/rng';
import { emptyParticle, PARTICLE_STYLE, startParticle, stepParticle, type Particle, type ParticleDirection, type ParticleKind } from '@/fx/particle-state';
import { particleVertex, particleFragment } from '@/fx/particle-shaders';
export type { ParticleKind } from '@/fx/particle-state';

export interface ParticleOptions {
  capacity: number; seed: number; intensity: number;
  smoke: boolean; dust: boolean; gravel: boolean; spark: boolean; flame: boolean;
}
interface Batch {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  offset: THREE.InstancedBufferAttribute; colour: THREE.InstancedBufferAttribute;
  direction: THREE.InstancedBufferAttribute; shape: THREE.InstancedBufferAttribute; style: THREE.InstancedBufferAttribute;
}
const MAX = 768;
const DEFAULTS: ParticleOptions = { capacity: 512, seed: 104, intensity: 1, smoke: true, dust: true, gravel: true, spark: true, flame: true };

/** Two fixed, generated billboard batches: normal-blended puffs/stones and additive flame/sparks. */
export class Particles {
  readonly mesh: THREE.Mesh;
  readonly meshes: ReadonlyArray<THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>>;
  private readonly batches: Batch[];
  private readonly pool: Particle[] = Array.from({ length: MAX }, emptyParticle);
  private options = { ...DEFAULTS };
  private rng: Rng;
  private next = 0;
  private disposed = false;
  private dirty = true;

  constructor(private readonly scene: THREE.Scene, options: Partial<ParticleOptions> = {}) {
    this.configure(options); this.rng = createRng(this.options.seed);
    this.batches = [this.makeBatch(false), this.makeBatch(true)];
    this.meshes = this.batches.map((b) => b.mesh); this.mesh = this.meshes[0];
    scene.add(...this.meshes);
  }

  configure(options: Partial<ParticleOptions>): void {
    Object.assign(this.options, options);
    this.options.capacity = Math.floor(Math.max(8, Math.min(MAX, Number.isFinite(this.options.capacity) ? this.options.capacity : 512)));
    this.options.intensity = Math.max(0, Math.min(2, Number.isFinite(this.options.intensity) ? this.options.intensity : 1));
    for (let i = 0; i < this.pool.length; i++) if (i >= this.options.capacity || !this.options[this.pool[i].kind]) this.pool[i].alive = false;
    this.next %= this.options.capacity; this.dirty = true;
  }

  /** Existing collision emit API is preserved; optional flow points along model exhaust +Z. */
  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, intensity = 1, flow?: ParticleDirection): void {
    if (this.disposed || !this.options[kind] || !(this.options.intensity > 0)) return;
    this.dirty = true;
    const p = this.pool[this.next]; this.next = (this.next + 1) % this.options.capacity;
    startParticle(p, kind, x, y, z, vx, vy, vz, Math.max(0.05, Math.min(2, intensity * this.options.intensity)), this.rng, flow);
  }

  update(elapsed: number): void {
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(0.1, Number.isFinite(elapsed) ? elapsed : 0)), counts = [0, 0];
    if (!dt && !this.dirty) return;
    this.dirty = false;
    for (const p of this.pool) {
      if (!p.alive) continue;
      // A particle emitted at the car's current pose must not jump one frame of travel (0.9 m at 200 km/h) ahead of it.
      if (p.fresh) p.fresh = false; else if (dt) stepParticle(p, dt);
      if (!p.alive) continue;
      const family = PARTICLE_STYLE[p.kind] > 2 ? 1 : 0, b = this.batches[family], n = counts[family]++;
      const t = p.age / p.life, size = Math.min(1.8, Math.max(0.004, p.size + p.grow * p.age));
      b.offset.setXYZ(n, p.x, p.y, p.z); b.direction.setXYZ(n, p.dx, p.dy, p.dz);
      b.shape.setXY(n, size, p.grow ? size : p.length);
      const alpha = p.alpha * (1 - t) * (family ? 1 : Math.min(1, p.age * 14));
      b.colour.setXYZW(n, p.r, p.g, p.b, alpha); b.style.setXY(n, PARTICLE_STYLE[p.kind], p.phase);
    }
    for (let i = 0; i < this.batches.length; i++) {
      const b = this.batches[i], n = counts[i]; b.mesh.geometry.instanceCount = n; b.mesh.visible = n > 0;
      if (!n) continue;
      for (const a of [b.offset, b.colour, b.direction, b.shape, b.style]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
      const fog = this.scene.fog;
      b.mesh.material.uniforms.fogDensity.value = fog instanceof THREE.FogExp2 ? fog.density : 0;
      if (fog) b.mesh.material.uniforms.fogColor.value.copy(fog.color);
    }
  }

  reset(seed = this.options.seed): void {
    this.options.seed = seed; this.rng = createRng(seed); this.next = 0;
    for (const p of this.pool) p.alive = false;
    for (const b of this.batches) { b.mesh.geometry.instanceCount = 0; b.mesh.visible = false; }
  }
  snapshot() { return { capacity: this.options.capacity, particles: this.pool.filter((p) => p.alive).map((p) => ({ ...p })) }; }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const b of this.batches) { b.mesh.removeFromParent(); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
  }

  private makeBatch(glow: boolean): Batch {
    const base = new THREE.PlaneGeometry(2, 2), geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.getAttribute('position')); base.dispose();
    const attr = (name: string, width: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * width), width).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a); return a;
    };
    const offset = attr('aOffset', 3), colour = attr('aColour', 4), direction = attr('aDirection', 3), shape = attr('aShape', 2), style = attr('aStyle', 2);
    geo.instanceCount = 0;
    const fog = this.scene.fog;
    const material = new THREE.ShaderMaterial({ uniforms: { sunDir: { value: SUN_DIRECTION }, fogColor: { value: fog?.color.clone() ?? new THREE.Color(0xc9d8de) }, fogDensity: { value: fog instanceof THREE.FogExp2 ? fog.density : 0 } }, vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; mesh.renderOrder = glow ? 6 : 5; mesh.name = glow ? 'particles-glow' : 'particles'; mesh.visible = false;
    return { mesh, offset, colour, direction, shape, style };
  }
}
