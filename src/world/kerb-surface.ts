import * as THREE from 'three';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import { kerbProfileHeight, taperedKerbWidths } from '@/track/kerb-profile';
import { VERGE_FALL } from '@/track/track-query';
import { fbm } from '@/world/dem';
import { buildStrip } from '@/world/strip';

export { kerbProfileHeight } from '@/track/kerb-profile';

export function buildKerbGeometry(track: Track, line: RacingLine, widths: Float32Array, sign: 1 | -1, wear: number, types?: Uint8Array): THREE.BufferGeometry {
  const taper = types ? widths : taperedKerbWidths(widths), edge = sign > 0 ? track.left.edge : track.right.edge;
  const geo = buildStrip(track, {
    include: (i) => widths[i] > 0.05 || Boolean(types && (widths[track.wrap(i - 1)] > 0.05 || widths[track.wrap(i + 1)] > 0.05)),
    from: (i) => sign > 0 ? edge[i] : -(edge[i] + taper[i]),
    to: (i) => sign > 0 ? edge[i] + taper[i] : -edge[i],
    segments: 8,
    lift: (i, u) => {
      const v = sign > 0 ? u : 1 - u;
      return kerbProfileHeight(v, taper[i], types ? types[i] : 1) + v * taper[i] * VERGE_FALL;
    },
    colour: (i, u, d, c) => {
      const v = sign > 0 ? u : 1 - u;
      const close = Math.max(0, 1 - Math.abs(line.offset[i] - sign * edge[i]) / 3);
      const grain = fbm((track.px[i] + track.lx[i] * d) / 1.8, (track.pz[i] + track.lz[i] * d) / 1.8, 2, 49);
      const rubber = Math.exp(-(((v - 0.2) / 0.28) ** 2)) * close * (0.3 + grain * 0.1);
      c.setRGB(1, 1, 1).multiplyScalar(1 - wear * (0.08 + Math.max(0, grain) * 0.12 + rubber));
    },
  });
  // Across spans one paint tile; alternating 1.6 m stripes run along the circuit.
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let v = 0; v < uv.count; v++) uv.setXY(v, sign > 0 ? (v % 9) / 8 : 1 - (v % 9) / 8, uv.getY(v) / 3.2);
  return geo;
}
