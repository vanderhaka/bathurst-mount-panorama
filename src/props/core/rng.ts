// Small deterministic random helpers (mulberry32), so every variant is stable.

export interface Rng {
  /** Uniform [0, 1). */
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Symmetric jitter in [-amount, amount]. */
  jitter(amount: number): number;
}

export function createRng(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0 || 1;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, maxInclusive) => Math.floor(min + (maxInclusive - min + 1) * next());
  next.pick = (items) => items[Math.floor(next() * items.length) % items.length];
  next.jitter = (amount) => (next() * 2 - 1) * amount;
  return next;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
