import * as THREE from 'three';
import type { RacingLine } from '@/track/racing-line';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';

const WIDTH = 1.7;
const AHEAD = 260; // metres of line shown ahead of the car
/** The line starts this far ahead of the car's centre (just past the front bumper). */
const START_AHEAD = 7;

const GREEN = new THREE.Color(0x35d46a);
const YELLOW = new THREE.Color(0xffc21a);
const RED = new THREE.Color(0xff3326);
const tmp = new THREE.Color();

/**
 * Braking demand for a point `dist` metres ahead whose profile speed is `target`:
 * the deceleration needed to arrive at the target speed, as a fraction of `decel`.
 * The line shows red above LINE_RED, yellow from LINE_YELLOW and green below.
 */
/** Braking-demand thresholds for red (brake now) and yellow (lift / brush the brakes). */
export const LINE_RED = 0.55;
export const LINE_YELLOW = 0.15;

export function brakeRatio(target: number, speed: number, dist: number, decel = 15): number {
  const t = target * 0.97;
  return (speed * speed - (t * 1.02) ** 2) / (2 * dist) / decel;
}

/** Chevron strip texture (arrows pointing along +V). */
function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  // A soft solid band (reads as a continuous line at speed) with bright chevrons on top.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(4, 0, 56, 128);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  ctx.moveTo(0, 70); ctx.lineTo(32, 30); ctx.lineTo(64, 70); ctx.lineTo(64, 100); ctx.lineTo(32, 60); ctx.lineTo(0, 100);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Forza-style dynamic racing line: chevrons along the optimal line, coloured by
 * how hard the driver must brake from the current speed to reach the target
 * speed at that point (green = accelerate, yellow = lift/light brake, red = brake now).
 */
export class RacingLineMesh {
  readonly mesh: THREE.Mesh;
  mode: 'off' | 'braking' | 'full' = 'braking';
  private readonly colours: THREE.BufferAttribute;
  private readonly n: number;

  constructor(private readonly track: Track, line: RacingLine, private readonly profile: SpeedProfile) {
    const n = track.n;
    this.n = n;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const col = new Float32Array((n + 1) * 2 * 4);
    const idx: number[] = [];
    let v = 0;
    for (let k = 0; k <= n; k++) {
      const i = k % n;
      const d = line.offset[i];
      for (const side of [-1, 1]) {
        const dd = d + (side * WIDTH) / 2;
        const x = track.px[i] + track.lx[i] * dd, z = track.pz[i] + track.lz[i] * dd;
        pos.set([x, heightAt(track, i, 0, dd) + 0.025, z], v * 3);
        uv.set([side < 0 ? 0 : 1, (k * track.spacing) / 2.2], v * 2);
        v++;
      }
      if (k < n) {
        const a = k * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.colours = new THREE.BufferAttribute(col, 4);
    this.colours.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.colours);
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: chevronTexture(), vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'racing-line';
  }

  /** Recolours the visible window ahead of the car. `decel` = braking capability (m/s^2). */
  update(s: number, speed: number, decel = 15): void {
    const { track, profile, n } = this;
    const arr = this.colours.array as Float32Array;
    arr.fill(0);
    this.mesh.visible = this.mode !== 'off';
    if (!this.mesh.visible) return;
    const i0 = Math.floor(track.wrapS(s + START_AHEAD) / track.spacing);
    const steps = Math.ceil((AHEAD - START_AHEAD) / track.spacing);
    for (let k = 0; k < steps; k++) {
      const i = (i0 + k) % n;
      const dist = k * track.spacing + START_AHEAD;
      const ratio = brakeRatio(profile.speed[i], speed, dist, decel);
      let alpha = 0.85;
      if (ratio > LINE_RED) tmp.copy(RED);
      else if (ratio > LINE_YELLOW) tmp.copy(YELLOW).lerp(RED, (ratio - LINE_YELLOW) / (LINE_RED - LINE_YELLOW));
      else if (ratio > 0.0) tmp.copy(GREEN).lerp(YELLOW, ratio / LINE_YELLOW);
      else {
        // Hidden tail in braking mode: keep the green hue so that the fade never blends to blue.
        tmp.copy(GREEN);
        alpha = this.mode === 'full' ? 0.7 : 0;
      }
      // Fade in/out at the ends of the window.
      alpha *= Math.min(1, (dist - START_AHEAD) / 6) * Math.min(1, (AHEAD - dist) / 60);
      for (const v of [i * 2, i * 2 + 1]) arr.set([tmp.r, tmp.g, tmp.b, alpha], v * 4);
      if (i === 0) for (const v of [n * 2, n * 2 + 1]) arr.set([tmp.r, tmp.g, tmp.b, alpha], v * 4);
    }
    this.colours.needsUpdate = true;
  }
}
