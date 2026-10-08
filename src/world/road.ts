import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUND, ROAD, TRACKSIDE } from '@/art/palette';
import { linearColour } from '@/art/materials';
import { getGraphics } from '@/config/graphics';
import type { KerbLayout } from '@/track/kerbs';
import { rubberAmount } from '@/track/rubber-line';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import { fbm } from '@/world/dem';
import { buildKerbGeometry } from '@/world/kerb-surface';
import { buildBrakingSkids, buildWallScuffs } from '@/world/road-marks';
import { createRoadMaterials, roadOptions, type RoadOptions } from '@/world/road-materials';
import { buildStrip } from '@/world/strip';

export type { RoadOptions } from '@/world/road-materials';

export function buildRoad(track: Track, line: RacingLine, kerbs: KerbLayout, renderer: THREE.WebGLRenderer, options: RoadOptions = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = 'road';
  const settings = roadOptions(options, getGraphics().rubberGroove);
  const materials = createRoadMaterials(renderer, track.length, settings);
  const rubber: number[] = [];
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
      const g = rubberAmount(line.offset[i], d) * settings.rubberGroove;
      rubber.push(g);
      c.multiplyScalar((1 - 0.42 * g) / materials.meanLinear);
    },
  });
  surface.setAttribute('roadRubber', new THREE.Float32BufferAttribute(rubber, 1));
  const uv = surface.getAttribute('uv'), position = surface.getAttribute('position');
  const weatherUv = new Float32Array(uv.count * 2);
  for (let v = 0; v < uv.count; v++) {
    weatherUv[v * 2] = uv.getX(v) / 16 + fbm(position.getX(v) / 73, position.getZ(v) / 73, 2, 77) * 0.25;
    weatherUv[v * 2 + 1] = uv.getY(v) * 4 * Math.round(track.length / 64) / track.length;
  }
  surface.setAttribute('roadWeatherUv', new THREE.BufferAttribute(weatherUv, 2));
  // disposeWorld already disposes this geometry; it owns all road-only maps/materials.
  surface.addEventListener('dispose', materials.dispose);
  const road = new THREE.Mesh(surface, materials.road);
  road.receiveShadow = true;
  road.name = 'road-surface';
  group.add(road);

  // White edge lines, lifted a few millimetres, drawn over the road.
  const white = linearColour(ROAD.lineWhite);
  const edgeLine = (sign: 1 | -1) =>
    buildStrip(track, {
      from: (i) => (sign > 0 ? track.left.edge[i] - 0.16 : -track.right.edge[i]),
      to: (i) => (sign > 0 ? track.left.edge[i] : -track.right.edge[i] + 0.16),
      segments: 1,
      lift: () => 0.006,
      colour: (i, _u, _d, c) => c.copy(white).multiplyScalar(0.94 + fbm(track.px[i] / 5, track.pz[i] / 5, 2, 31) * settings.lineWear * 0.1),
    });
  for (const sign of [1, -1] as const) {
    const m = new THREE.Mesh(edgeLine(sign), materials.paint);
    m.name = sign > 0 ? 'edge-line-left' : 'edge-line-right';
    m.receiveShadow = true;
    group.add(m);
  }

  // Start/finish line and grid slots on Pit Straight.
  group.add(buildStartMarkings(track, materials.paint));

  // Kerb texture defines metre-scale stripes; geometry keeps the bevel and lowered outer edge.
  for (const [arr, types, sign] of [[kerbs.left, kerbs.leftType, 1], [kerbs.right, kerbs.rightType, -1]] as const) {
    const geo = buildKerbGeometry(track, line, arr, sign, settings.kerbWear, types);
    const mesh = new THREE.Mesh(geo, materials.kerb);
    mesh.receiveShadow = true;
    mesh.name = 'kerbs';
    group.add(mesh);
  }
  if (settings.skids) {
    if (track.id === 'bathurst') {
      const scuffs = new THREE.Mesh(buildWallScuffs(track), materials.skid);
      scuffs.name = 'wall-tyre-scuffs';
      scuffs.receiveShadow = true;
      group.add(scuffs);
    }
    if (options.profile) {
      const skids = new THREE.Mesh(buildBrakingSkids(track, line, options.profile), materials.skid);
      skids.name = 'braking-skids';
      skids.receiveShadow = true;
      group.add(skids);
    }
  }
  return group;
}

export function buildStartMarkings(track: Track, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'start-markings';
  const white = linearColour(ROAD.lineWhite);
  const i0 = track.wrap(Math.round(track.startLineS / track.spacing));
  // Start line: one sample long band across the road.
  const line = buildStrip(track, {
    include: (i) => i === i0 || i === track.wrap(i0 + 1),
    from: (i) => -track.right.edge[i],
    to: (i) => track.left.edge[i],
    segments: 1,
    lift: () => 0.007,
    colour: (_i, _u, _d, c) => c.copy(white),
  });
  // Shrink the band to 0.6 m along the track by moving the far edge back.
  const pos = line.getAttribute('position') as THREE.BufferAttribute;
  const lineUv = line.getAttribute('uv') as THREE.BufferAttribute;
  const lineLength = 0.6 / track.spacing;
  for (let v = 2; v < 4; v++) {
    const k = v - 2;
    pos.setXYZ(v, pos.getX(k) + (pos.getX(v) - pos.getX(k)) * lineLength, pos.getY(k) + (pos.getY(v) - pos.getY(k)) * lineLength, pos.getZ(k) + (pos.getZ(v) - pos.getZ(k)) * lineLength);
    lineUv.setY(v, lineUv.getY(k) + (lineUv.getY(v) - lineUv.getY(k)) * lineLength);
  }
  // Adelaide uses its estimated grid line; retain the existing Bathurst markings.
  const bars: THREE.BufferGeometry[] = [line];
  for (let slot = 0; slot < 12; slot++) {
    const s = (track.id === 'adelaide' ? track.gridLineS : track.startLineS) - 10 - slot * 8;
    const i = track.wrap(Math.round(s / track.spacing));
    const side = slot % 2 === 0 ? 1 : -1;
    bars.push(
      buildStrip(track, {
        include: (k) => k === i || k === track.wrap(i + 1),
        from: () => (side > 0 ? 0.8 : -4.6),
        to: () => (side > 0 ? 4.6 : -0.8),
        segments: 1,
        lift: () => 0.007,
        colour: (_k, _u, _d, c) => c.copy(white),
      }),
    );
  }
  for (const b of bars.slice(1)) {
    const p = b.getAttribute('position') as THREE.BufferAttribute;
    const uv = b.getAttribute('uv') as THREE.BufferAttribute;
    const length = 0.24 / track.spacing;
    for (let v = 2; v < 4; v++) {
      const k = v - 2;
      if (v >= p.count) continue;
      p.setXYZ(v, p.getX(k) + (p.getX(v) - p.getX(k)) * length, p.getY(k) + (p.getY(v) - p.getY(k)) * length, p.getZ(k) + (p.getZ(v) - p.getZ(k)) * length);
      uv.setY(v, uv.getY(k) + (uv.getY(v) - uv.getY(k)) * length);
    }
  }
  const merged = mergeGeometries(bars)!;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  for (const b of bars) b.dispose();
  const mesh = new THREE.Mesh(merged, mat);
  mesh.receiveShadow = true;
  g.add(mesh);
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
