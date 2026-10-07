#!/usr/bin/env node
// Builds src/track/data/*.json from real-world sources:
//  - Circuit centreline: OpenStreetMap ways named by corner (data/raw/osm-circuit.json)
//  - Elevation: SRTM 30 m via api.opentopodata.org (cached in data/raw/)
// Run: node scripts/build-track-data.mjs [--refetch]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RAW = resolve(ROOT, 'data/raw');
const OUT = process.env.TRACK_OUT ? resolve(process.env.TRACK_OUT) : resolve(ROOT, 'src/track/data');
const REFETCH = process.argv.includes('--refetch');
const OFFICIAL_LENGTH_M = 6213;
const SPACING_M = 4;
/**
 * Sharpest crest / hollow (vertical radius, m) that an added apex may make: the radius a
 * Gen3 car takes at its racing speed there with 0.45 g of unloading (0.8 g of compression),
 * never below the floor. Slow crests such as Skyline may be sharp; fast ones stay gentle.
 */
const APEX_MIN_R = { crest: 1500, hollow: 600 };
const SPEED_EST = existsSync(resolve(RAW, 'speed-estimate.json')) ? JSON.parse(readFileSync(resolve(RAW, 'speed-estimate.json'), 'utf8')).speed : null;
function apexMinRadius(s, crest, total) {
  const floor = crest ? APEX_MIN_R.crest : APEX_MIN_R.hollow;
  if (!SPEED_EST) return crest ? 1500 : 600;
  const v = SPEED_EST[Math.floor((((s % total) + total) % total) / total * SPEED_EST.length) % SPEED_EST.length];
  return Math.max(floor, (v * v) / ((crest ? 0.45 : 0.8) * 9.81));
}


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
let elevSmooth = gaussianSmoothClosed(elevFull, 24 / SPACING_M);

// Fuse with NSW Spatial Services 2 m contour crossings (docs/research/circuit-facts.md).
// A monotone cubic (PCHIP) runs through the exact crossing points. Between crossings of
// two different contours the road cannot rise above or fall below them, so no bump is
// invented there (an earlier SRTM-shaped fit put a false crest on the Chase kink).
// Between two crossings of the same contour (a crest or a hollow) an apex point is
// added; SRTM decides its height inside the 2 m contour band.
const contourPath = resolve(RAW, 'nsw-contour-crossings.json');
if (existsSync(contourPath)) {
  const crossings = JSON.parse(readFileSync(contourPath, 'utf8')).crossings;
  const lapRef = 6204; // chainage unit of the contour file (flat projection lap length)
  const total = pts.length * SPACING_M;
  const P = crossings.map((c) => ({ s: (c.chainage_m / lapRef) * total, e: c.elevation_m })).sort((a, b) => a.s - b.s);
  elevSmooth = fuseContours(P, elevSmooth, total);
  const rms = Math.sqrt(P.reduce((a, p) => a + (sampleAt(elevSmooth, p.s) - p.e) ** 2, 0) / P.length);
  console.log(`Fused ${P.length} NSW contour crossings (monotone through crossings): RMS residual ${rms.toFixed(2)} m`);
}

function sampleAt(arr, s) {
  const f = s / SPACING_M;
  const i = Math.floor(f), t = f - i, n = arr.length;
  return arr[((i % n) + n) % n] * (1 - t) + arr[(((i + 1) % n) + n) % n] * t;
}

function fuseContours(raw, srtm, total) {
  const gap = (a, b) => { let d = b.s - a.s; if (d <= 0) d += total; return d; };
  // The same contour reported twice a few metres apart is one crossing.
  const cross = [];
  for (const c of raw) {
    const last = cross[cross.length - 1];
    if (last && last.e === c.e && c.s - last.s < 12) last.s = (last.s + c.s) / 2;
    else cross.push({ ...c });
  }
  // Apex points between two crossings of the same contour. The side (above/below the
  // contour) flips at every crossing; it is known from the last different level.
  const P = [];
  const m = cross.length;
  let side = 0;
  for (let k = 0; k < m; k++) {
    const a = cross[k], b = cross[(k + 1) % m], prev = cross[(k - 1 + m) % m];
    if (a.e !== prev.e) side = a.e > prev.e ? 1 : -1; // arrived from below: above the contour after a
    else side = -side;
    P.push(a);
    if (b.e !== a.e) continue;
    const L = gap(a, b);
    const maxAmp = Math.min(1.9, (L * L) / (8 * apexMinRadius(a.s + L / 2, side > 0, total)));
    let best = Math.min(0.05, maxAmp), bestS = a.s + L / 2;
    const ea = sampleAt(srtm, a.s), eb = sampleAt(srtm, b.s);
    for (let u = 0.15; u <= 0.85; u += 0.05) {
      const dev = side * (sampleAt(srtm, a.s + L * u) - (ea + (eb - ea) * u));
      if (dev > best) { best = dev; bestS = a.s + L * u; }
    }
    P.push({ s: bestS % total, e: a.e + side * Math.min(maxAmp, best) });
  }
  P.sort((x, y) => x.s - y.s);
  // Monotone cubic Hermite (Fritsch-Carlson) on the closed loop.
  const n = P.length;
  const h = P.map((p, k) => gap(p, P[(k + 1) % n]));
  const d = P.map((p, k) => (P[(k + 1) % n].e - p.e) / h[k]);
  const tan = P.map((_, k) => {
    const d0 = d[(k - 1 + n) % n], d1 = d[k];
    if (d0 * d1 <= 0) return 0;
    const h0 = h[(k - 1 + n) % n], h1 = h[k];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / d0 + w2 / d1);
  });
  const out = new Array(srtm.length);
  let k = n - 1;
  for (let i = 0; i < srtm.length; i++) {
    const s = i * SPACING_M;
    // Segment k: P[k] <= s < P[k + 1] (with wrap-around).
    k = 0;
    while (k < n - 1 && P[k + 1].s <= s) k++;
    if (s < P[0].s) k = n - 1;
    let t = s - P[k].s;
    if (t < 0) t += total;
    const u = t / h[k];
    const e0 = P[k].e, e1 = P[(k + 1) % n].e, m0 = tan[k] * h[k], m1 = tan[(k + 1) % n] * h[k];
    const u2 = u * u, u3 = u2 * u;
    out[i] = (2 * u3 - 3 * u2 + 1) * e0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * e1 + (u3 - u2) * m1;
  }
  // Light smoothing: removes the curvature steps of the cubic at the crossings. (A lighter,
  // speed-dependent width was tried: it made Forrest's Elbow too uneven for the line colours.)
  return gaussianSmoothClosed(out, 16 / SPACING_M);
}

// ---- 4b. Vertical curves fit for racing speed. Real roads are built with smooth
// vertical curves, and Gen3 cars do not leave the ground anywhere at Bathurst. A crest
// sharper than v^2 / (0.45 g) (or a dip sharper than v^2 / (0.8 g)) at the local racing
// speed would lift or slam the car, and the data
// (2 m contours, 30 m SRTM) cannot resolve crests that sharp anyway, so they are relaxed.
elevSmooth = limitVerticalCurves(elevSmooth, pts);

function limitVerticalCurves(elev, path) {
  const n = path.length, ds = SPACING_M, G = 9.81;
  // Racing speed per sample: the game's full-grip racing-line profile exported by
  // tests/debug/export-speed.test.ts (data/raw/speed-estimate.json). The highest speed
  // within 20 m is used, because a crest in the old data lowers the profile on it.
  const est = JSON.parse(readFileSync(resolve(RAW, 'speed-estimate.json'), 'utf8')).speed;
  const raw = path.map((_, i) => est[Math.round((i / n) * est.length) % est.length]);
  const v = raw.map((_, i) => {
    let m = 0;
    for (let k = -5; k <= 5; k++) m = Math.max(m, raw[(i + k + n) % n]);
    return m;
  });
  // Crests may unload the car by 0.45 g, dips (compressions) may load it by 0.8 g.
  const rCrest = v.map((vv) => (vv * vv) / (0.45 * G));
  const rDip = v.map((vv) => (vv * vv) / (0.8 * G));
  const y = elev.slice();
  let moved = 0;
  for (let it = 0; it < 20000; it++) {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const mid = (y[(i - 1 + n) % n] + y[(i + 1) % n]) / 2;
      const top = mid + (ds * ds) / (2 * rCrest[i]);
      const bottom = mid - (ds * ds) / (2 * rDip[i]);
      const target = Math.min(top, Math.max(bottom, y[i]));
      if (target !== y[i]) { worst = Math.max(worst, Math.abs(y[i] - target)); y[i] = target; }
    }
    if (worst < 1e-4) break;
  }
  for (let i = 0; i < n; i++) moved = Math.max(moved, Math.abs(y[i] - elev[i]));
  console.log(`Vertical-curve limiter: largest local change ${moved.toFixed(2)} m`);
  return gaussianSmoothClosed(y, 4 / ds);
}

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
// Calibrate the vertical range to the published 174 m (SRTM gives ~177 m; NSW
// contours give 172-174 m). Terrain heights get the same transform.
const OFFICIAL_RANGE_M = 174;
const rawMin = Math.min(...elevSmooth), rawMax = Math.max(...elevSmooth);
const vScale = OFFICIAL_RANGE_M / (rawMax - rawMin);
const calib = (h) => rawMin + (h - rawMin) * vScale;
for (let i = 0; i < elevSmooth.length; i++) elevSmooth[i] = calib(elevSmooth[i]);
for (let i = 0; i < gridElev.length; i++) gridElev[i] = calib(gridElev[i]);
for (let i = 0; i < farElev.length; i++) farElev[i] = calib(farElev[i]);
console.log(`Vertical calibration x${vScale.toFixed(4)} (raw range ${(rawMax - rawMin).toFixed(1)} m -> ${OFFICIAL_RANGE_M} m)`);
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
    elevationSource: 'SRTM 30 m (opentopodata.org) fused with NSW Spatial Services 2 m contour crossings, range calibrated to the published 174 m',
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
