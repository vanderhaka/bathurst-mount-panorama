#!/usr/bin/env node
// Extracts real trackside features from OpenStreetMap (data/raw/osm-features.json,
// data/raw/osm-circuit.json) into the track's local metre frame:
//  - src/track/data/features.json (walls, fences, sand, woods, buildings, camp pitches, ...)
//  - per-sample barrier offsets and sand extents appended to mount-panorama.json
// Run after build-track-data.mjs: node scripts/build-features.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const trackPath = resolve(ROOT, 'src/track/data/mount-panorama.json');
const track = JSON.parse(readFileSync(trackPath, 'utf8'));
const osm = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/osm-features.json'), 'utf8'));
const circuit = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/osm-circuit.json'), 'utf8'));

const { lat: lat0, lon: lon0 } = track.meta.origin;
const scale = track.meta.scaleToOfficial;
const phi = (lat0 * Math.PI) / 180;
const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const mPerDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
const toXZ = (lat, lon) => [round((lon - lon0) * mPerDegLon * scale), round(-(lat - lat0) * mPerDegLat * scale)];
function round(v) { return Math.round(v * 10) / 10; }
const geomXZ = (g) => g.map((p) => toXZ(p.lat, p.lon));
const centroid = (pts) => [round(pts.reduce((a, p) => a + p[0], 0) / pts.length), round(pts.reduce((a, p) => a + p[1], 0) / pts.length)];

const tags = (e) => e.tags ?? {};
const ways = osm.elements.filter((e) => e.type === 'way' && e.geometry);
const nodes = osm.elements.filter((e) => e.type === 'node');
const rels = osm.elements.filter((e) => e.type === 'relation');

const features = {
  walls: ways.filter((w) => tags(w).barrier === 'wall').map((w) => geomXZ(w.geometry)),
  fences: ways.filter((w) => tags(w).barrier === 'fence').map((w) => geomXZ(w.geometry)),
  sand: ways.filter((w) => tags(w).natural === 'sand').map((w) => geomXZ(w.geometry)),
  woods: ways.filter((w) => ['wood', 'scrub'].includes(tags(w).natural) || tags(w).landuse === 'forest').map((w) => ({ kind: tags(w).natural ?? 'wood', poly: geomXZ(w.geometry) })),
  grassland: ways.filter((w) => ['grassland', 'meadow'].includes(tags(w).natural ?? tags(w).landuse)).map((w) => geomXZ(w.geometry)),
  water: ways.filter((w) => tags(w).natural === 'water').map((w) => geomXZ(w.geometry)),
  parking: ways.filter((w) => tags(w).amenity === 'parking').map((w) => geomXZ(w.geometry)),
  vineyards: ways.filter((w) => ['vineyard', 'orchard'].includes(tags(w).landuse)).map((w) => ({ kind: tags(w).landuse, poly: geomXZ(w.geometry) })),
  buildings: ways.filter((w) => tags(w).building && tags(w).building !== 'roof').map((w) => {
    const t = tags(w);
    const poly = geomXZ(w.geometry);
    let kind = 'generic';
    if (t.building === 'house' || t.building === 'residential') kind = 'house';
    else if (t.building === 'grandstand') kind = 'grandstand';
    else if (t.building === 'shed' || t.building === 'garage') kind = 'shed';
    else if (t.tourism === 'museum') kind = 'museum';
    else if (t.tourism === 'hotel') kind = 'hotel';
    else if (t.building === 'school' || t.building === 'college') kind = 'school';
    else if (t.amenity === 'shelter') kind = 'shelter';
    return { kind, name: t.name ?? null, levels: Number(t['building:levels'] ?? 0) || null, poly };
  }),
  campPitches: ways.filter((w) => tags(w).tourism === 'camp_pitch').map((w) => centroid(geomXZ(w.geometry)))
    .concat(nodes.filter((n) => tags(n).tourism === 'camp_pitch').map((n) => toXZ(n.lat, n.lon))),
  trees: nodes.filter((n) => tags(n).natural === 'tree').map((n) => toXZ(n.lat, n.lon)),
  treeRows: ways.filter((w) => tags(w).natural === 'tree_row').map((w) => geomXZ(w.geometry)),
  videoWalls: nodes.filter((n) => tags(n).man_made === 'video_wall').map((n) => toXZ(n.lat, n.lon)),
  towers: nodes.filter((n) => tags(n).man_made === 'tower').map((n) => toXZ(n.lat, n.lon))
    .concat(ways.filter((w) => tags(w).man_made === 'tower').map((w) => centroid(geomXZ(w.geometry)))),
  marshalPosts: [...nodes, ...ways].filter((e) => tags(e).amenity === 'shelter' && /marshal/i.test(tags(e).name ?? ''))
    .map((e) => ({ name: tags(e).name, xz: e.type === 'node' ? toXZ(e.lat, e.lon) : centroid(geomXZ(e.geometry)) })),
  footbridges: ways.filter((w) => tags(w).bridge === 'yes' && ['footway', 'steps', 'path'].includes(tags(w).highway)).map((w) => geomXZ(w.geometry)),
  stoneSign: rels.filter((r) => /panorama/i.test(tags(r).name ?? '') && r.members).flatMap((r) => r.members.filter((m) => m.geometry).map((m) => geomXZ(m.geometry))),
  pitLane: circuit.elements.filter((e) => e.type === 'way' && e.tags?.name === 'Pit Lane').map((w) => geomXZ(w.geometry)),
  serviceRoads: ways.filter((w) => ['service', 'track'].includes(tags(w).highway) && !tags(w).bridge).map((w) => geomXZ(w.geometry)),
  finishLine: toXZ(-33.43949, 149.55984),
  startLine: toXZ(-33.43927, 149.55824),
};

// ---- Per-sample barrier offsets from the real walls and fences.
const pts = track.points;
const n = pts.length;
const left = pts.map((p, i) => {
  const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  const dx = b[0] - a[0], dz = b[2] - a[2], h = Math.hypot(dx, dz);
  return [dz / h, -dx / h];
});
function segmentHits(polylines, maxDist) {
  // For each sample, nearest polyline crossing of the lateral ray on each side.
  const outL = new Array(n).fill(-1), outR = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const [cx, , cz] = pts[i];
    const [lx, lz] = left[i];
    for (const line of polylines) {
      for (let k = 0; k < line.length - 1; k++) {
        const [x1, z1] = line[k], [x2, z2] = line[k + 1];
        // Solve c + t*l = p1 + u*(p2-p1)
        const ex = x2 - x1, ez = z2 - z1;
        const den = lx * ez - lz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((x1 - cx) * ez - (z1 - cz) * ex) / den;
        const u = ((x1 - cx) * lz - (z1 - cz) * lx) / den;
        if (u < 0 || u > 1 || Math.abs(t) > maxDist) continue;
        if (t > 0 && (outL[i] < 0 || t < outL[i])) outL[i] = round(t);
        if (t < 0 && (outR[i] < 0 || -t < outR[i])) outR[i] = round(-t);
      }
    }
  }
  return { outL, outR };
}
const walls = segmentHits(features.walls, 40);
const fences = segmentHits(features.fences, 30);
// Sand extent: furthest sand-polygon edge crossed on each side within 140 m.
const sandHits = (() => {
  const L = new Array(n).fill(0), R = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const [cx, , cz] = pts[i];
    const [lx, lz] = left[i];
    for (const poly of features.sand) {
      for (let k = 0; k < poly.length - 1; k++) {
        const [x1, z1] = poly[k], [x2, z2] = poly[k + 1];
        const ex = x2 - x1, ez = z2 - z1;
        const den = lx * ez - lz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((x1 - cx) * ez - (z1 - cz) * ex) / den;
        const u = ((x1 - cx) * lz - (z1 - cz) * lx) / den;
        if (u < 0 || u > 1 || Math.abs(t) > 140) continue;
        if (t > 0) L[i] = Math.max(L[i], round(t));
        else R[i] = Math.max(R[i], round(-t));
      }
    }
  }
  return { L, R };
})();

// ---- Finish and start lines as distances along the track.
const nearestS = ([x, z]) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (pts[i][0] - x) ** 2 + (pts[i][2] - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return round(best * track.meta.spacingM);
};
track.meta.finishLineS = nearestS(features.finishLine);
track.meta.startLineS = nearestS(features.startLine);
track.sides = { wallL: walls.outL, wallR: walls.outR, fenceL: fences.outL, fenceR: fences.outR, sandL: sandHits.L, sandR: sandHits.R };
writeFileSync(trackPath, JSON.stringify(track));
writeFileSync(resolve(ROOT, 'src/track/data/features.json'), JSON.stringify(features));

const cover = (a) => `${Math.round((a.filter((v) => v > 0).length / n) * 100)}%`;
console.log(`finish line s=${track.meta.finishLineS}, start line s=${track.meta.startLineS}`);
console.log(`wall coverage L ${cover(walls.outL)} R ${cover(walls.outR)}; fence L ${cover(fences.outL)} R ${cover(fences.outR)}; sand L ${cover(sandHits.L)} R ${cover(sandHits.R)}`);
for (const k of Object.keys(features)) {
  const v = features[k];
  console.log(`  ${k}: ${Array.isArray(v) ? v.length : JSON.stringify(v)}`);
}
