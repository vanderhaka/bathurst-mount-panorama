import * as THREE from 'three';
import type { Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';

export interface StripOptions {
  /** Lateral offsets (m, + = left) of the strip's two sides at sample i (from < to). */
  from: (i: number) => number;
  to: (i: number) => number;
  segments: number;
  /** Extra height above the track surface function at (i, u in 0..1 across, d). */
  lift?: (i: number, u: number, d: number) => number;
  /** Vertex colour (linear) at (i, u, d). Defaults to white. */
  colour?: (i: number, u: number, d: number, out: THREE.Color) => void;
  /** Samples to include (default: all). Runs of included samples become separate pieces. */
  include?: (i: number) => boolean;
  /** Texture repeat length in metres for metric UVs (u across = d / repeat, v along = s / repeat). */
  uvRepeat?: number;
  /** Non-indexed output (per-quad colour taken at the quad's first corner) for blocky colour patterns. */
  faceted?: boolean;
  /** Sample stride (2 = every other sample) for cheap strips. */
  stride?: number;
}

/** Builds a ribbon that follows the track surface between two lateral offsets. */
export function buildStrip(track: Track, o: StripOptions): THREE.BufferGeometry {
  const n = track.n;
  const stride = o.stride ?? 1;
  const runs = findRuns(n, stride, o.include);
  const pos: number[] = [], col: number[] = [], uvs: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  const seg = o.segments;
  const repeat = o.uvRepeat ?? 1;
  for (const run of runs) {
    const base = pos.length / 3;
    let previousS = -Infinity;
    run.forEach((i) => {
      const a = o.from(i), b = o.to(i);
      let s = i * track.spacing;
      while (s < previousS) s += track.length;
      previousS = s;
      for (let k = 0; k <= seg; k++) {
        const u = k / seg;
        const d = a + (b - a) * u;
        const y = heightAt(track, i, 0, d) + (o.lift ? o.lift(i, u, d) : 0);
        pos.push(track.px[i] + track.lx[i] * d, y, track.pz[i] + track.lz[i] * d);
        c.setRGB(1, 1, 1);
        o.colour?.(i, u, d, c);
        col.push(c.r, c.g, c.b);
        uvs.push(d / repeat, s / repeat);
      }
    });
    for (let r = 0; r < run.length - 1; r++) {
      for (let k = 0; k < seg; k++) {
        const a = base + r * (seg + 1) + k, b = a + 1, cc = a + seg + 1, d = cc + 1;
        // Winding so that the normal points up (strip runs from right (from) to left (to)).
        idx.push(a, cc, d, a, d, b);
      }
    }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  if (o.faceted) {
    geo = flatColours(geo);
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

interface Run extends Array<number> { closed?: boolean }

function findRuns(n: number, stride: number, include?: (i: number) => boolean): Run[] {
  const all: number[] = [];
  for (let i = 0; i < n; i += stride) all.push(i);
  if (!include) {
    const run: Run = [...all, 0];
    run.closed = true;
    return [run];
  }
  const ok = all.map((i) => include(i));
  if (ok.every(Boolean)) {
    const run: Run = [...all, 0];
    run.closed = true;
    return [run];
  }
  // Start scanning just after an excluded sample so wrap-around runs stay whole.
  const start = ok.findIndex((v) => !v);
  const runs: Run[] = [];
  let cur: Run = [];
  for (let k = 1; k <= all.length; k++) {
    const j = (start + k) % all.length;
    if (ok[j]) cur.push(all[j]);
    else if (cur.length) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

/** Converts to non-indexed geometry where every triangle takes the colour of its first vertex. */
function flatColours(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = geo.toNonIndexed();
  const colour = out.getAttribute('color') as THREE.BufferAttribute;
  for (let t = 0; t < colour.count; t += 3) {
    const r = colour.getX(t), g = colour.getY(t), b = colour.getZ(t);
    colour.setXYZ(t + 1, r, g, b);
    colour.setXYZ(t + 2, r, g, b);
  }
  return out;
}
