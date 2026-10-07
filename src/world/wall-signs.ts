import * as THREE from 'three';
import { getGraphics, onGraphicsChange, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import { weatherTracksideMaterial } from '@/world/trackside-materials';
import { wallImpactScuffs } from '@/world/trackside-layout';
import type { SideArrays } from '@/track/apply-layout';
import type { Track } from '@/track/track-model';
import { pointAt, sampleArray } from '@/track/track-query';
import { sponsorAt, sponsorAtlas, sponsorCell } from '@/world/scenery/billboards';

/** Painted sponsor panels on the track face of the concrete walls (fictional sponsors). */
const PANEL_LEN = 2.4;
const Y0 = 0.36, Y1 = 0.96;
/** A run of RUN metres of one sponsor, then GAP metres of bare concrete. */
const RUN = 22, GAP = 50;
/** Only walls this close to the road edge get signs (the others are hidden behind run-off). */
const MAX_SETBACK = 10;

/** Offset of the sloped upper wall face at height h (matches WALL_PROFILE in barriers.ts). */
const faceOffset = (h: number) => 0.07 + ((h - 0.3) / 0.75) * 0.06;

export function buildWallSigns(track: Track, quality: QualityPreset = 'high'): THREE.Mesh {
  const pos: number[] = [], uv: number[] = [];
  const a: [number, number, number] = [0, 0, 0], b: [number, number, number] = [0, 0, 0];
  for (const sign of [1, -1] as const) {
    const side = sign > 0 ? track.left : track.right;
    const phase = sign > 0 ? 0 : (RUN + GAP) / 2;
    for (let c = 0; c * (RUN + GAP) + phase < track.length; c++) {
      const runStart = c * (RUN + GAP) + phase;
      const cell = sponsorCell(sponsorAt(runStart, c * 3 + (sign > 0 ? 0 : 1)));
      for (let s0 = runStart; s0 + PANEL_LEN <= runStart + RUN; s0 += PANEL_LEN + 0.15) {
        if (!concreteWall(track, side, s0) || !concreteWall(track, side, s0 + PANEL_LEN)) continue;
        // Text reads left to right from the road: along +s on the left wall, -s on the right.
        const [uA, uB] = sign > 0 ? [cell.u0, cell.u1] : [cell.u1, cell.u0];
        const quad = (h: number, s: number, out: [number, number, number]) => {
          const f = track.wrapS(s) / track.spacing;
          const d = sampleArray(track, side.wall, Math.floor(f) % track.n, f - Math.floor(f)) + faceOffset(h) - 0.012;
          pointAt(track, s, sign * d, out);
          out[1] += h;
          return out;
        };
        const corners = [quad(Y0, s0, a).slice(), quad(Y0, s0 + PANEL_LEN, b).slice(), quad(Y1, s0 + PANEL_LEN, a).slice(), quad(Y1, s0, b).slice()];
        const uvs = [[uA, cell.v0], [uB, cell.v0], [uB, cell.v1], [uA, cell.v1]];
        for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...corners[k]); uv.push(...uvs[k]); }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const base = new THREE.MeshStandardMaterial({
    map: sponsorAtlas(), roughness: 0.85, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const ratio = QUALITY[quality].wallWeather / 0.45;
  const weather = weatherTracksideMaterial(base, { amount: getGraphics().wallWeather * ratio, panels: true, scuffs: wallImpactScuffs(track) });
  const unsubscribe = onGraphicsChange(g => weather.setAmount(g.wallWeather * ratio));
  let disposed = false;
  geo.addEventListener('dispose', () => { if (disposed) return; disposed = true; unsubscribe(); weather.dispose(); base.dispose(); });
  const mesh = new THREE.Mesh(geo, weather.material);
  mesh.receiveShadow = true;
  mesh.name = 'wall-signs';
  return mesh;
}

/** True where the side has a plain concrete wall close to the road at distance s. */
function concreteWall(track: Track, side: SideArrays, s: number): boolean {
  const i = Math.floor(track.wrapS(s) / track.spacing) % track.n;
  return side.barrier[i] !== 'tyres' && side.wall[i] - side.edge[i] < MAX_SETBACK;
}
