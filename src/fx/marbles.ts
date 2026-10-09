import * as THREE from 'three';
import { createRng } from '@/props/core/rng';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import { pointAt, sampleArray } from '@/track/track-query';

export interface MarblePoint { s: number; d: number; x: number; y: number; z: number; size: number; yaw: number; tone: number }
export interface MarbleOptions { enabled: boolean; count: number; distance: number; seed: number }
const CAPACITY = 512;
const DEFAULTS: MarbleOptions = { enabled: true, count: 384, distance: 100, seed: 810 };

/** Sparse generated rubber fragments remain on asphalt, outside the car-width racing groove. */
export function planMarbles(track: Track, line: RacingLine, seed: number): MarblePoint[] {
  const rng = createRng(seed), points: MarblePoint[] = [], point: [number, number, number] = [0, 0, 0];
  const stride = Math.max(1, Math.ceil(track.n / 750));
  for (let base = 0; base < track.n; base += stride) {
    const turn = Math.min(1, Math.abs(line.curvature[base]) * 70), count = 2 + Math.floor(turn * 2);
    for (const side of [-1, 1]) for (let k = 0; k < count && points.length < 4096; k++) {
      const s = track.wrapS((base + rng.jitter(stride * 0.4)) * track.spacing);
      const f = s / track.spacing, index = Math.floor(f), t = f - index;
      const left = sampleArray(track, track.left.edge, index, t) - 0.2, right = -sampleArray(track, track.right.edge, index, t) + 0.2;
      const groove = sampleArray(track, line.offset, index, t);
      const lo = side > 0 ? Math.max(right, groove + 1.71) : right;
      const hi = side > 0 ? left : Math.min(left, groove - 1.71);
      if (hi - lo < 0.05) continue;
      const spread = rng() ** 2 * (hi - lo), d = side > 0 ? hi - spread : lo + spread;
      pointAt(track, s, d, point);
      points.push({ s, d, x: point[0], y: point[1] + 0.005, z: point[2], size: rng.range(0.015, 0.04), yaw: rng() * Math.PI * 2, tone: rng.range(0.025, 0.06) });
    }
  }
  return points;
}

/** One capped, opaque batch around lap position; call update with the car/capture track distance. */
export class Marbles {
  readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private options = { ...DEFAULTS };
  private points: MarblePoint[];
  private visible: MarblePoint[] = [];
  private lastS = NaN;
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private disposed = false;

  constructor(scene: THREE.Scene, private readonly track: Track, private readonly line: RacingLine, options: Partial<MarbleOptions> = {}) {
    Object.assign(this.options, options);
    this.points = planMarbles(track, line, this.options.seed);
    // A crushed, four-face crumb has a flat bottom and no stock spherical silhouette.
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([
      -0.8,0,-0.8, 0.9,0,-0.6, 0.2,0.9,0.2,
      0.9,0,-0.6, 0.3,0,1, 0.2,0.9,0.2,
      0.3,0,1, -0.8,0,-0.8, 0.2,0.9,0.2,
      -0.8,0,-0.8, 0.3,0,1, 0.9,0,-0.6,
    ], 3));
    geo.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.98 }), CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.visible = false;
    this.mesh.name = 'rubber-marbles'; this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.configure(options); scene.add(this.mesh);
  }

  configure(options: Partial<MarbleOptions>): void {
    const seed = this.options.seed; Object.assign(this.options, options);
    this.options.count = Math.floor(Math.max(0, Math.min(CAPACITY, Number.isFinite(this.options.count) ? this.options.count : 384)));
    this.options.distance = Math.max(10, Math.min(150, Number.isFinite(this.options.distance) ? this.options.distance : 100));
    if (seed !== this.options.seed) this.points = planMarbles(this.track, this.line, this.options.seed);
    this.lastS = NaN;
    if (!this.options.enabled) { this.mesh.count = 0; this.mesh.visible = false; this.visible = []; }
  }

  update(s: number): void {
    if (this.disposed || !Number.isFinite(s)) return;
    if (!this.options.enabled || !this.options.count) { this.mesh.count = 0; this.mesh.visible = false; this.visible = []; return; }
    const half = this.track.length / 2;
    const delta = (a: number, b: number) => Math.abs(this.track.wrapS(a - b + half) - half);
    if (Number.isFinite(this.lastS) && delta(s, this.lastS) < 2) return;
    this.lastS = s; this.visible = [];
    for (const p of this.points) {
      if (delta(p.s, s) > this.options.distance) continue;
      const n = this.visible.length; if (n >= this.options.count) break;
      this.visible.push(p);
      this.matrix.compose(this.position.set(p.x, p.y, p.z), this.rotation.setFromAxisAngle(this.up, p.yaw), this.scale.set(p.size * 0.6, 0.006, p.size));
      this.mesh.setMatrixAt(n, this.matrix); this.mesh.setColorAt(n, this.colour.setRGB(p.tone, p.tone, p.tone));
    }
    const n = this.visible.length; this.mesh.count = n; this.mesh.visible = n > 0;
    if (n) {
      this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, n * 16); this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) { this.mesh.instanceColor.clearUpdateRanges(); this.mesh.instanceColor.addUpdateRange(0, n * 3); this.mesh.instanceColor.needsUpdate = true; }
      this.mesh.computeBoundingSphere();
    }
  }
  snapshot(): MarblePoint[] { return this.visible.map((p) => ({ ...p })); }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.visible = []; this.points = [];
  }
}
