import type { Rng } from '@/props/core/rng';

export type ParticleKind = 'smoke' | 'dust' | 'gravel' | 'spark' | 'flame';
export interface ParticleDirection { x: number; y: number; z: number }
export interface Particle {
  alive: boolean; kind: ParticleKind; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  dx: number; dy: number; dz: number; age: number; life: number; size: number; length: number; grow: number;
  r: number; g: number; b: number; alpha: number; drag: number; gravity: number; ground: number; bounced: boolean; phase: number;
  /** Started this frame: drawn where it was emitted, moved from the next update on. */
  fresh: boolean;
}
export const PARTICLE_STYLE: Record<ParticleKind, number> = { smoke: 0, dust: 1, gravel: 2, spark: 3, flame: 4 };
export const emptyParticle = (): Particle => ({ alive: false, kind: 'smoke', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dx: 0, dy: 1, dz: 0, age: 0, life: 1, size: 1, length: 1, grow: 0, r: 1, g: 1, b: 1, alpha: 1, drag: 0, gravity: 0, ground: 0, bounced: false, phase: 0, fresh: false });

/** Metre-scale generated puffs and glowing streaks; no textures or per-particle meshes. */
export function startParticle(p: Particle, kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, intensity: number, rng: Rng, flow?: ParticleDirection): void {
  p.alive = true; p.kind = kind; p.x = x; p.y = y; p.z = z; p.age = 0; p.ground = y - 0.006; p.bounced = false; p.fresh = true;
  p.phase = rng() * Math.PI * 2; p.grow = 0; p.gravity = 0; p.drag = 1; p.alpha = 1;
  p.dx = Math.cos(p.phase); p.dy = Math.sin(p.phase); p.dz = 0;
  if (kind === 'smoke' || kind === 'dust') {
    const dust = kind === 'dust';
    p.vx = vx * 0.32 + rng.jitter(0.8); p.vy = vy * 0.15 + rng.range(0.4, 1.1); p.vz = vz * 0.32 + rng.jitter(0.8);
    p.life = rng.range(dust ? 1.05 : 1.35, dust ? 1.7 : 2.1); p.size = rng.range(0.18, 0.3); p.length = p.size;
    p.grow = dust ? 0.72 : 0.6; p.alpha = (dust ? 0.25 : 0.28) * intensity; p.drag = 1.8; p.gravity = dust ? -0.05 : -0.25;
    const tint = rng.range(0.92, 1.08); p.r = (dust ? 0.35 : 0.72) * tint; p.g = (dust ? 0.27 : 0.75) * tint; p.b = (dust ? 0.17 : 0.78) * tint;
  } else if (kind === 'gravel') {
    p.vx = vx * 0.22 + rng.jitter(2.5); p.vy = rng.range(1.5, 3); p.vz = vz * 0.22 + rng.jitter(2.5);
    p.life = rng.range(0.35, 0.75); p.size = rng.range(0.01, 0.035); p.length = p.size * 0.7;
    p.r = 0.3; p.g = 0.24; p.b = 0.17; p.gravity = 9.81; p.drag = 0.45;
  } else if (kind === 'spark') {
    p.vx = vx * 0.18 + rng.jitter(4); p.vy = rng.range(0.5, 2); p.vz = vz * 0.18 + rng.jitter(4);
    p.life = rng.range(0.12, 0.32); p.size = rng.range(0.007, 0.014); p.length = rng.range(0.04, 0.12);
    p.r = 6 * intensity; p.g = 2.8 * intensity; p.b = 0.45 * intensity; p.gravity = 9.81; p.drag = 1.2;
    p.dx = p.vx; p.dy = p.vy; p.dz = p.vz;
  } else {
    p.dx = flow?.x ?? 0; p.dy = flow?.y ?? 0; p.dz = flow?.z ?? -1;
    p.vx = vx + p.dx * 4 + rng.jitter(0.15); p.vy = vy + p.dy * 4; p.vz = vz + p.dz * 4 + rng.jitter(0.15);
    p.life = rng.range(0.045, 0.085); p.size = rng.range(0.028, 0.05) * intensity; p.length = rng.range(0.1, 0.22) * intensity;
    p.r = 6; p.g = 2; p.b = 0.25; p.drag = 0.05; p.alpha = 0.8;
  }
}

/** Two small ground-bouncing families; smoke keeps drifting above the emission surface. */
export function stepParticle(p: Particle, dt: number): void {
  p.age += dt;
  if (p.age >= p.life) { p.alive = false; return; }
  const decay = Math.exp(-p.drag * dt);
  p.vx *= decay; p.vz *= decay; p.vy = p.vy * decay - p.gravity * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if ((p.kind === 'spark' || p.kind === 'gravel') && p.y < p.ground) {
    if (p.bounced) { p.alive = false; return; }
    p.y = p.ground; p.vy = Math.abs(p.vy) * 0.3; p.bounced = true;
  }
}
