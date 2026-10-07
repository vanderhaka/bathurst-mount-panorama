#!/usr/bin/env node
// Builds src/track/data/*.json from real-world sources:
//  - Circuit centreline: OpenStreetMap ways named by corner (data/raw/osm-circuit.json)
//  - Elevation: SRTM 30 m via api.opentopodata.org (cached in data/raw/)
// Run: node scripts/build-track-data.mjs [--refetch]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RAW = resolve(ROOT, 'data/raw');
const OUT = resolve(ROOT, 'src/track/data');
const REFETCH = process.argv.includes('--refetch');
const OFFICIAL_LENGTH_M = 6213;
const SPACING_M = 4;

// Race order of the OSM ways (ids from data/raw/osm-circuit.json).
const WAY_ORDER = [
  306192512, // Pit Straight
  1115461019, 414156370, // Hell Corner (two ways)
  30111085, // Mountain Straight
  30111102, // Griffins Bend
  306192500, // The Cutting
  306192503, // Reid Park
  414156376, // Sulman Park
  306192504, // McPhillamy Park
  414156366, // Brocks Skyline
  306192501, // The Esses (incl. The Dipper)
  306192502, // Forrest's Elbow
  30111107, // Conrod Straight
  306192513, // The Chase
  306192514, // Conrod Straight (after The Chase)
  306192511, 414156373, // Murrays Corner (two ways)
];

const osm = JSON.parse(readFileSync(resolve(RAW, 'osm-circuit.json'), 'utf8'));
const ways = new Map(osm.elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));

// ---- 1. Chain ways into one closed loop of lat/lon with section names.
const chain = [];
let lastNode = null;
for (const id of WAY_ORDER) {
  const w = ways.get(id);
  if (!w) throw new Error(`way ${id} missing`);
  let nodes = w.nodes;
  let geom = w.geometry;
  if (lastNode !== null && nodes[0] !== lastNode) {
    if (nodes[nodes.length - 1] === lastNode) {
      nodes = [...nodes].reverse();
      geom = [...geom].reverse();
    } else throw new Error(`way ${id} (${w.tags.name}) does not connect to previous`);
  }
  const name = w.tags.name.replace('Brocks', "Brock's").replace('Murrays', "Murray's");
  geom.forEach((g, i) => {
    if (i === 0 && chain.length) return; // shared node
    chain.push({ lat: g.lat, lon: g.lon, name });
  });
  lastNode = nodes[nodes.length - 1];
}
if (lastNode !== ways.get(WAY_ORDER[0]).nodes[0]) throw new Error('loop does not close');
chain.pop(); // last point duplicates the first

// ---- 2. Project to local metres. x = east, z = -north (three.js: north is -Z).
const lat0 = chain.reduce((a, p) => a + p.lat, 0) / chain.length;
const lon0 = chain.reduce((a, p) => a + p.lon, 0) / chain.length;
const phi = (lat0 * Math.PI) / 180;
const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const mPerDegLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
const toXZ = (lat, lon) => [(lon - lon0) * mPerDegLon, -(lat - lat0) * mPerDegLat];
const toLatLon = (x, z) => [lat0 - z / mPerDegLat, lon0 + x / mPerDegLon];
const raw = chain.map((p) => ({ ...p, xz: toXZ(p.lat, p.lon) }));

// ---- 3. Resample the closed polyline at uniform spacing, then smooth.
function resampleClosed(pts, spacing) {
  const n = pts.length;
  const segLen = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i].xz, b = pts[(i + 1) % n].xz;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLen.push(l);
    total += l;
  }
  const count = Math.round(total / spacing);
  const step = total / count;
  const out = [];
  let seg = 0, segStart = 0;
  for (let k = 0; k < count; k++) {
    const s = k * step;
    while (s > segStart + segLen[seg]) { segStart += segLen[seg]; seg++; }
    const t = segLen[seg] > 0 ? (s - segStart) / segLen[seg] : 0;
    const a = pts[seg].xz, b = pts[(seg + 1) % n].xz;
    out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, name: pts[seg].name });
  }
  return { out, total };
}
function gaussianSmoothClosed(values, sigmaSamples) {
  const n = values.length;
  const r = Math.ceil(sigmaSamples * 3);
  const w = [];
  for (let i = -r; i <= r; i++) w.push(Math.exp(-(i * i) / (2 * sigmaSamples * sigmaSamples)));
  const ws = w.reduce((a, b) => a + b, 0);
  return values.map((_, i) => {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += values[(i + j + n) % n] * w[j + r];
    return acc / ws;
  });
}
const { out: res1, total: osmLength } = resampleClosed(raw, 1);
// Light smoothing (sigma 3 m) removes OSM node kinks but keeps the corner shapes.
const sx = gaussianSmoothClosed(res1.map((p) => p.x), 3);
const sz = gaussianSmoothClosed(res1.map((p) => p.z), 3);
const smooth = res1.map((p, i) => ({ xz: [sx[i], sz[i]], name: p.name }));
const { out: res, total: smoothLength } = resampleClosed(smooth, SPACING_M);
const scale = OFFICIAL_LENGTH_M / smoothLength;
const pts = res.map((p) => ({ x: p.x * scale, z: p.z * scale, name: p.name }));
console.log(`OSM length ${osmLength.toFixed(1)} m, smoothed ${smoothLength.toFixed(1)} m, scale x${scale.toFixed(5)} -> ${OFFICIAL_LENGTH_M} m, ${pts.length} samples`);

// ---- 4. Elevation from SRTM 30 m (opentopodata), cached.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchElevations(latlons, cacheFile, dataset = 'srtm30m') {
  const cachePath = resolve(RAW, cacheFile);
  if (!REFETCH && existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (cached.length === latlons.length) return cached;
  }
  const result = [];
  for (let i = 0; i < latlons.length; i += 100) {
    const batch = latlons.slice(i, i + 100);
    const q = batch.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join('|');
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`https://api.opentopodata.org/v1/${dataset}?locations=${q}&interpolation=bilinear`, {
        headers: { 'User-Agent': 'BathurstTrackResearch/1.0 (personal game project)' },
      });
      if (r.ok) {
        const j = await r.json();
        result.push(...j.results.map((x) => x.elevation));
        break;
      }
      if (attempt > 5) throw new Error(`elevation fetch failed: ${r.status}`);
      await sleep(2000 * (attempt + 1));
    }
    process.stdout.write(`\r  ${cacheFile}: ${Math.min(i + 100, latlons.length)}/${latlons.length}`);
    await sleep(1100);
  }
  process.stdout.write('\n');
  writeFileSync(cachePath, JSON.stringify(result));
  return result;
}

// Sample elevation every 12 m along the track (the DEM is 30 m), then interpolate.
const ELEV_STEP = 3; // samples (3 x 4 m = 12 m)
const elevIdx = pts.map((_, i) => i).filter((i) => i % ELEV_STEP === 0);
const elevLL = elevIdx.map((i) => toLatLon(pts[i].x / scale, pts[i].z / scale));
const elevRaw = await fetchElevations(elevLL, 'elev-track-srtm30.json');
const elevFull = pts.map((_, i) => {
  const k = Math.floor(i / ELEV_STEP);
  const t = (i % ELEV_STEP) / ELEV_STEP;
  const a = elevRaw[k], b = elevRaw[(k + 1) % elevRaw.length];
  return a + (b - a) * t;
});
// SRTM is noisy (tree canopy, 30 m cells). Smooth with sigma = 24 m along the track.
const elevSmooth = gaussianSmoothClosed(elevFull, 24 / SPACING_M);

// ---- 5. Terrain DEM grid around the circuit (for the landscape mesh).
const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
const GRID_SIZE = 4800, GRID_N = 81; // 60 m cells
const gridLL = [];
for (let j = 0; j < GRID_N; j++) for (let i = 0; i < GRID_N; i++) {
  const x = cx - GRID_SIZE / 2 + (i * GRID_SIZE) / (GRID_N - 1);
  const z = cz - GRID_SIZE / 2 + (j * GRID_SIZE) / (GRID_N - 1);
  gridLL.push(toLatLon(x / scale, z / scale));
}
const gridElev = await fetchElevations(gridLL, 'elev-grid-srtm30.json');
// Far landscape ring: 16 km square at 500 m cells (SRTM 90 m is fine here).
const FAR_SIZE = 16000, FAR_N = 33;
const farLL = [];
for (let j = 0; j < FAR_N; j++) for (let i = 0; i < FAR_N; i++) {
  const x = cx - FAR_SIZE / 2 + (i * FAR_SIZE) / (FAR_N - 1);
  const z = cz - FAR_SIZE / 2 + (j * FAR_SIZE) / (FAR_N - 1);
  farLL.push(toLatLon(x / scale, z / scale));
}
const farElev = await fetchElevations(farLL, 'elev-far-srtm90.json', 'srtm90m');

// ---- 6. Sections (by OSM way name) and statistics.
const sections = [];
pts.forEach((p, i) => {
  if (!sections.length || sections[sections.length - 1].name !== p.name) sections.push({ name: p.name, startIndex: i });
});
const base = Math.floor(Math.min(...elevSmooth));
const minE = Math.min(...elevSmooth), maxE = Math.max(...elevSmooth);
const minI = elevSmooth.indexOf(minE), maxI = elevSmooth.indexOf(maxE);
console.log(`Elevation (SRTM, smoothed): min ${minE.toFixed(1)} m at ${pts[minI].name}, max ${maxE.toFixed(1)} m at ${pts[maxI].name}, range ${(maxE - minE).toFixed(1)} m`);
console.log(`Raw SRTM range: ${(Math.max(...elevFull) - Math.min(...elevFull)).toFixed(1)} m`);
for (const s of sections) {
  const e = elevSmooth[s.startIndex];
  console.log(`  ${String(s.startIndex * SPACING_M).padStart(5)} m  ${e.toFixed(1)} m  ${s.name}`);
}

mkdirSync(OUT, { recursive: true });
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
writeFileSync(resolve(OUT, 'mount-panorama.json'), JSON.stringify({
  meta: {
    name: 'Mount Panorama Circuit, Bathurst NSW',
    centrelineSource: 'OpenStreetMap contributors (ODbL), ways tagged alt_name=Mount Panorama Scenic Road',
    elevationSource: 'SRTM 30 m via opentopodata.org, Gaussian-smoothed sigma 24 m',
    osmLengthM: round(osmLength, 1),
    scaleToOfficial: round(scale, 6),
    lengthM: OFFICIAL_LENGTH_M,
    spacingM: OFFICIAL_LENGTH_M / pts.length,
    origin: { lat: lat0, lon: lon0, note: 'x = east metres, z = -north metres, before scale' },
    elevationBaseM: base,
    elevationMinM: round(minE, 1),
    elevationMaxM: round(maxE, 1),
  },
  // [x, y, z] with y = metres above elevationBaseM
  points: pts.map((p, i) => [round(p.x), round(elevSmooth[i] - base), round(p.z)]),
  sections: sections.map((s) => ({ name: s.name, startIndex: s.startIndex })),
}));
const pack = (arr) => arr.map((v) => round(v - base, 1));
writeFileSync(resolve(OUT, 'terrain-dem.json'), JSON.stringify({
  near: { centerX: round(cx), centerZ: round(cz), size: GRID_SIZE, n: GRID_N, heights: pack(gridElev) },
  far: { centerX: round(cx), centerZ: round(cz), size: FAR_SIZE, n: FAR_N, heights: pack(farElev) },
  elevationBaseM: base,
}));
console.log('wrote', resolve(OUT, 'mount-panorama.json'), 'and terrain-dem.json');
