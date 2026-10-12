// Owns the scene environment map used by car paint: sky + streamed HDRI + track probes.
import * as THREE from 'three';
import { QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { createSkyEnvironment } from '@/world/lighting';
import { loadCarHdri } from '@/world/env-hdri';
import { bakeReflectionProbes, bakeReflectionProbesAsync, probeCountFor, type ProbeRig } from '@/world/reflection-probes';

export interface CarEnv {
  /** Current PMREM texture assigned to scene.environment. */
  texture: THREE.Texture;
  refreshSky(): void;
  /** Streams the HDRI (no-op on Low) and rebuilds the env map when it arrives. */
  ensureHdri(): Promise<void>;
  /** Bakes track probes after the world is in the scene. */
  bakeProbes(track: Track, hide: THREE.Object3D[]): void;
  /** The same bake, yielding to the event loop after each probe; the old probes keep serving cars until the new ones are ready. */
  bakeProbesAsync(track: Track, hide: THREE.Object3D[], pause: (done: number, total: number) => Promise<void>): Promise<void>;
  /** Blends the nearest probe onto car materials from track distance s. */
  follow(s: number, carMaterials: Iterable<THREE.Material>): void;
  setQuality(q: QualityPreset): void;
  dispose(): void;
}

/** Collects materials under car roots so probes can override their envMap. */
export function carEnvMaterials(...roots: Array<THREE.Object3D | null | undefined>): THREE.Material[] {
  const out: THREE.Material[] = [];
  for (const root of roots) {
    if (!root) continue;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material;
      if (Array.isArray(m)) out.push(...m);
      else if (m) out.push(m);
    });
  }
  return out;
}

export function createCarEnv(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  skyDome: THREE.Mesh,
  quality: QualityPreset,
): CarEnv {
  let q = quality;
  let hdri: THREE.Texture | null = null;
  let environment = createSkyEnvironment(renderer, skyDome, q, hdri);
  scene.environment = environment.texture;
  let probes: ProbeRig | null = null;
  let hdriLoading: Promise<void> | null = null;
  /** A newer bake, quality change or dispose makes an unfinished bake stale. */
  let bakeId = 0;

  const rebuild = () => {
    const old = environment;
    environment = createSkyEnvironment(renderer, skyDome, q, hdri);
    scene.environment = environment.texture;
    old.dispose();
  };

  return {
    get texture() { return environment.texture; },
    refreshSky() { rebuild(); },
    async ensureHdri() {
      if (!QUALITY[q].hdriEnv || hdri) return;
      if (!hdriLoading) {
        hdriLoading = loadCarHdri(renderer, q).then((tex) => {
          if (tex && QUALITY[q].hdriEnv) { hdri = tex; rebuild(); }
        }).finally(() => { hdriLoading = null; });
      }
      await hdriLoading;
    },
    bakeProbes(track, hide) {
      bakeId++;
      probes?.dispose();
      probes = bakeReflectionProbes(renderer, scene, track, probeCountFor(q), hide);
    },
    async bakeProbesAsync(track, hide, pause) {
      const id = ++bakeId;
      const next = await bakeReflectionProbesAsync(renderer, scene, track, probeCountFor(q), hide, pause);
      if (id !== bakeId) { next?.dispose(); return; }
      const old = probes;
      probes = next;
      old?.dispose();
    },
    follow(s, carMaterials) { probes?.update(s, carMaterials); },
    setQuality(next) {
      if (next === q) return;
      q = next;
      bakeId++;
      if (!QUALITY[q].hdriEnv) hdri = null;
      probes?.dispose();
      probes = null;
      rebuild();
      void this.ensureHdri();
    },
    dispose() {
      bakeId++;
      probes?.dispose();
      environment.dispose();
    },
  };
}
