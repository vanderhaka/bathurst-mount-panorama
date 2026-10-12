// Static reflection probes along the centreline. Baked once from the world
// (cars hidden), then blended by track distance onto car materials.
import * as THREE from 'three';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import type { QualityPreset } from '@/render/renderer';
import { QUALITY } from '@/config/graphics';

export interface ReflectionProbe {
  s: number;
  target: THREE.WebGLRenderTarget;
}

export interface ProbeRig {
  probes: ReflectionProbe[];
  /** Nearest-two blend into `blended`; call when the car moves. */
  update(s: number, carMaterials: Iterable<THREE.Material>): void;
  dispose(): void;
}

const SCRATCH: [number, number, number] = [0, 0, 0];

/** Probe count for the tier (0 = off). */
export function probeCountFor(quality: QualityPreset): number {
  return QUALITY[quality].reflectionProbes;
}

/**
 * Bakes `count` cube PMREMs along the track, one per step. Hides `hide` only while each capture runs, so
 * cars stay visible if the caller renders between steps. Returns null when count is 0 or nothing was baked.
 */
function* bakeSteps(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  track: Track,
  count: number,
  hide: THREE.Object3D[],
): Generator<void, ProbeRig | null> {
  if (count <= 0) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cube = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
  const cam = new THREE.CubeCamera(0.4, 400, cube);

  const probes: ReflectionProbe[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const s = (i + 0.5) * (track.length / count);
      pointAt(track, s, 0, SCRATCH);
      cam.position.set(SCRATCH[0], SCRATCH[1] + 1.1, SCRATCH[2]);
      const previous: boolean[] = hide.map((o) => o.visible);
      for (const o of hide) o.visible = false;
      try {
        cam.update(renderer, scene);
        probes.push({ s, target: pmrem.fromCubemap(cube.texture) });
      } finally {
        hide.forEach((o, k) => { o.visible = previous[k]!; });
      }
      yield;
    }
  } catch (error) {
    for (const p of probes) p.target.dispose();
    throw error;
  } finally {
    cube.dispose();
    pmrem.dispose();
  }
  if (!probes.length) return null;
  return makeRig(track, probes);
}

function makeRig(track: Track, probes: ReflectionProbe[]): ProbeRig {
  let blended: THREE.Texture = probes[0]!.target.texture;
  let lastA = -1, lastB = -1;

  return {
    probes,
    update(s, carMaterials) {
      const len = track.length;
      const x = ((s % len) + len) % len;
      let a = 0, b = 0, best = Infinity, second = Infinity;
      for (let i = 0; i < probes.length; i++) {
        const d = Math.min(Math.abs(probes[i]!.s - x), len - Math.abs(probes[i]!.s - x));
        if (d < best) { second = best; b = a; best = d; a = i; }
        else if (d < second) { second = d; b = i; }
      }
      if (a === lastA && b === lastB) return;
      lastA = a; lastB = b;
      // Prefer the nearer probe; dual-probe lerp needs a custom RT. Nearest is stable with hysteresis above.
      blended = probes[a]!.target.texture;
      for (const m of carMaterials) {
        if ('envMap' in m) {
          (m as THREE.MeshStandardMaterial).envMap = blended;
          m.needsUpdate = true;
        }
      }
    },
    dispose() {
      for (const p of probes) p.target.dispose();
    },
  };
}

/** Bakes every probe in one go (boot, behind the loading screen). */
export function bakeReflectionProbes(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  track: Track,
  count: number,
  hide: THREE.Object3D[] = [],
): ProbeRig | null {
  const steps = bakeSteps(renderer, scene, track, count, hide);
  for (;;) { const next = steps.next(); if (next.done) return next.value; }
}

/** The same bake, handing control back to the event loop after each probe (no long task, no frozen frames). */
export async function bakeReflectionProbesAsync(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  track: Track,
  count: number,
  hide: THREE.Object3D[],
  pause: (done: number, total: number) => Promise<void>,
): Promise<ProbeRig | null> {
  const steps = bakeSteps(renderer, scene, track, count, hide);
  for (let done = 1; ; done++) {
    const next = steps.next();
    if (next.done) return next.value;
    await pause(done, count);
  }
}
