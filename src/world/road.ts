import * as THREE from 'three';
import { GROUND, ROAD, TRACKSIDE } from '@/art/palette';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import { getGraphics } from '@/config/graphics';
import type { KerbLayout } from '@/track/kerbs';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import { fbm } from '@/world/dem';
import { buildStrip } from '@/world/strip';
import { asphaltTexture } from '@/world/textures';

/** Mean value (linear) of the asphalt texture; vertex colours divide it out. */
const ASPHALT_TEX_MEAN = 0.34;

export function buildRoad(track: Track, line: RacingLine, kerbs: KerbLayout, renderer: THREE.WebGLRenderer): THREE.Group {
  const group = new THREE.Group();
  group.name = 'road';
  const groove = getGraphics().rubberGroove;
  const asphalt = linearColour(ROAD.asphalt);
  const worn = linearColour(ROAD.asphaltWorn);

  // Road surface: asphalt texture x vertex colour (base tint, patching, rubbered racing groove).
  const surface = buildStrip(track, {
    from: (i) => -track.right.edge[i],
    to: (i) => track.left.edge[i],
    segments: 12,
    uvRepeat: 4,
    colour: (i, _u, d, c) => {
      const x = track.px[i], z = track.pz[i];
      const patch = fbm(x / 45 + d / 30, z / 45, 3, 5);
      c.copy(asphalt).lerp(worn, Math.max(0, patch) * 0.8);
      const g = Math.exp(-(((d - line.offset[i]) / 1.25) ** 2)) * groove;
      c.multiplyScalar((1 - 0.42 * g) / ASPHALT_TEX_MEAN);
    },
  });
  const tex = asphaltTexture(renderer);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, vertexColors: true, roughness: 0.88, metalness: 0 });
  const road = new THREE.Mesh(surface, roadMat);
  road.receiveShadow = true;
  road.name = 'road-surface';
  group.add(road);

  // White edge lines, lifted a few millimetres, drawn over the road.
  const lineMat = vertexColourMaterial({ roughness: 0.6, flat: false });
  const lineMatOffset = lineMat.clone();
  lineMatOffset.polygonOffset = true;
  lineMatOffset.polygonOffsetFactor = -2;
  lineMatOffset.polygonOffsetUnits = -2;
  const white = linearColour(ROAD.lineWhite);
  const edgeLine = (sign: 1 | -1) =>
    buildStrip(track, {
      from: (i) => (sign > 0 ? track.left.edge[i] - 0.16 : -track.right.edge[i]),
      to: (i) => (sign > 0 ? track.left.edge[i] : -track.right.edge[i] + 0.16),
      segments: 1,
      lift: () => 0.006,
      colour: (_i, _u, _d, c) => c.copy(white),
    });
  for (const sign of [1, -1] as const) {
    const m = new THREE.Mesh(edgeLine(sign), lineMatOffset);
    m.receiveShadow = true;
    group.add(m);
  }

  // Start/finish line and grid slots on Pit Straight.
  group.add(buildStartMarkings(track, lineMatOffset));

  // Kerbs: raised, red/white blocks, tapered at both ends.
  const red = linearColour(ROAD.kerbRed), kwhite = linearColour(ROAD.kerbWhite);
  for (const [arr, sign] of [[kerbs.left, 1], [kerbs.right, -1]] as const) {
    const taper = taperRuns(arr);
    const geo = buildStrip(track, {
      include: (i) => arr[i] > 0.05,
      from: (i) => (sign > 0 ? track.left.edge[i] : -(track.right.edge[i] + taper[i])),
      to: (i) => (sign > 0 ? track.left.edge[i] + taper[i] : -track.right.edge[i]),
      segments: 3,
      faceted: true,
      lift: (i, u) => {
        const v = sign > 0 ? u : 1 - u; // 0 at the road edge, 1 at the outer edge
        const p = v < 0.25 ? v / 0.25 : 1 - (v - 0.25) * 0.35;
        return 0.004 + 0.05 * p * Math.min(1, taper[i] / 0.6);
      },
      colour: (i, _u, _d, c) => c.copy(Math.floor((i * track.spacing) / 1.6) % 2 === 0 ? red : kwhite),
    });
    const mesh = new THREE.Mesh(geo, vertexColourMaterial({ roughness: 0.7, flat: true }));
    mesh.receiveShadow = true;
    mesh.name = 'kerbs';
    group.add(mesh);
  }
  return group;
}

/** Smooth ramps at the start and end of each kerb run (0..width). */
function taperRuns(arr: Float32Array): Float32Array {
  const n = arr.length;
  const out = Float32Array.from(arr);
  const ramp = 3;
  for (let i = 0; i < n; i++) {
    if (arr[i] <= 0) continue;
    let distToEnd = ramp;
    for (let k = 1; k <= ramp; k++) {
      if (arr[(i + k) % n] <= 0 || arr[(i - k + n) % n] <= 0) { distToEnd = k - 1; break; }
    }
    out[i] = arr[i] * Math.min(1, (distToEnd + 0.5) / (ramp + 0.5));
  }
  return out;
}

function buildStartMarkings(track: Track, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'start-markings';
  const white = linearColour(ROAD.lineWhite);
  const i0 = Math.round(track.startLineS / track.spacing);
  // Start line: one sample long band across the road.
  const line = buildStrip(track, {
    include: (i) => i === i0 || i === i0 + 1,
    from: (i) => -track.right.edge[i],
    to: (i) => track.left.edge[i],
    segments: 1,
    lift: () => 0.007,
    colour: (_i, _u, _d, c) => c.copy(white),
  });
  // Shrink the band to 0.6 m along the track by moving the far edge back.
  const pos = line.getAttribute('position') as THREE.BufferAttribute;
  for (let v = 2; v < 4; v++) {
    const k = v - 2;
    pos.setXYZ(v, pos.getX(k) + (pos.getX(v) - pos.getX(k)) * 0.15, pos.getY(v), pos.getZ(k) + (pos.getZ(v) - pos.getZ(k)) * 0.15);
  }
  g.add(new THREE.Mesh(line, mat));
  // Grid slot markings behind the line (staggered, 8 m apart): short white bars.
  const bars: THREE.BufferGeometry[] = [];
  for (let slot = 0; slot < 12; slot++) {
    const s = track.startLineS - 10 - slot * 8;
    const i = Math.round(s / track.spacing);
    const side = slot % 2 === 0 ? 1 : -1;
    bars.push(
      buildStrip(track, {
        include: (k) => k === i || k === i + 1,
        from: () => (side > 0 ? 0.8 : -4.6),
        to: () => (side > 0 ? 4.6 : -0.8),
        segments: 1,
        lift: () => 0.007,
        colour: (_k, _u, _d, c) => c.copy(white),
      }),
    );
  }
  for (const b of bars) {
    const p = b.getAttribute('position') as THREE.BufferAttribute;
    for (let v = 2; v < 4; v++) {
      const k = v - 2;
      p.setXYZ(v, p.getX(k) + (p.getX(v) - p.getX(k)) * 0.06, p.getY(v), p.getZ(k) + (p.getZ(v) - p.getZ(k)) * 0.06);
    }
    g.add(new THREE.Mesh(b, mat));
  }
  return g;
}

/** Verge colours by surface type (linear). */
export const VERGE_COLOURS = {
  grass: linearColour(GROUND.grass),
  grassDry: linearColour(GROUND.grassDry),
  gravel: linearColour(GROUND.gravel),
  asphalt: linearColour(ROAD.asphaltWorn),
  concrete: linearColour(TRACKSIDE.concrete),
};
