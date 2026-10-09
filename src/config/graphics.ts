// Central, tunable graphics configuration. Every visual value that a person may
// want to adjust lives here. The live graphics tuner (T or F2) edits this object; `live`
// values apply at once, `rebuild` values apply after "Rebuild world".
import type { QualityPreset } from '@/render/renderer';
import { AEDT_OFFSET_HOURS, BATHURST_LOCATION, raceDay, RACE_YEAR, solarPosition } from '@/world/solar-position';

export type ToneMapper = 'ACES' | 'AgX' | 'Neutral';

export interface GraphicsConfig {
  // --- live: lighting and atmosphere
  exposure: number;
  toneMapping: ToneMapper;
  /** Local AEDT hours on the second Sunday of October 2026. */
  timeOfDay: number;
  sunIntensity: number;
  sunColour: string;
  hemiIntensity: number;
  hemiSky: string;
  hemiGround: string;
  envIntensity: number;
  fogColour: string;
  fogDensity: number;
  skyZenith: string;
  skyHorizon: string;
  physicalSky: boolean;
  skyTurbidity: number;
  skyRayleigh: number;
  skyMie: number;
  cloudCoverage: number;
  aerialPerspective: boolean;
  /** Density scale height in reciprocal metres, measured above the 700 m datum. */
  hazeHeightFalloff: number;
  hazeSunWarmth: number;
  bloom: boolean;
  bloomStrength: number;
  /** Linear HDR threshold; ordinary diffuse surfaces stay below it. */
  bloomThreshold: number;
  bloomRadius: number;
  /** Shadow reach from the camera (m); each tier caps it at QUALITY[tier].shadowDistance. */
  shadowDistance: number;
  screenAo: number;
  bakedAo: number;
  // --- live: colour grade (display space)
  saturation: number;
  contrast: number;
  /** + = warmer (more red/yellow), - = cooler. */
  warmth: number;
  /** Lifts or lowers the darkest tones. */
  blackLift: number;
  vignette: number;
  // --- live: camera
  fov: number;
  cameraShake: number;
  smaa: boolean;
  cameraBlurStrength: number;
  sunFlareStrength: number;
  // --- rebuild: world content
  wallWeather: number;
  fenceDetail: boolean;
  fenceHardware: boolean;
  crowdDetail: boolean;
  crowdDensity: number;
  crowdMotion: number;
  tracksideDetail: boolean;
  flagMotion: number;
  distantLandmarks: boolean;
  hillDetail: number;
  treeDensity: number;
  treeBarkDetail: boolean;
  /** Live sway amplitude, 0..1 (approximately metres at the crown). */
  treeWind: number;
  woodlandUndergrowth: boolean;
  woodlandDensity: number;
  terrainColourNoise: number;
  /** Darkness of the rubbered-in racing groove on the asphalt (0..1). */
  rubberGroove: number;
  surfaceDetail: boolean;
  roadNormalStrength: number;
  roadRepairStrength: number;
  roadSkids: boolean;
  kerbWear: number;
  lineWear: number;
  terrainDetail: boolean;
  terrainNormalStrength: number;
  mownStrength: number;
  nearGrass: boolean;
  grassWind: number;
  grassTuftDensity: number;
  /** Distance at which trees switch to the low-detail mesh (m). */
  treeLodDistance: number;
  /** Trees and props beyond this distance are not drawn (m). */
  propDrawDistance: number;
}

// Sun, sky and exposure are HDR: the physical sky is far brighter than lit ground, so the exposure sits low
// and the sun carries the scene. The sun-to-ambient ratio (about 12:1) is what makes cast shadows read.
export const DEFAULT_GRAPHICS: GraphicsConfig = {
  exposure: 0.45,
  // Highest mean in the independent 12-view operator comparison (docs/REALISM.md).
  toneMapping: 'AgX',
  timeOfDay: 15,
  sunIntensity: 12,
  sunColour: '#fff0da',
  hemiIntensity: 0.9,
  hemiSky: '#bcd3ec',
  hemiGround: '#4f4d3c',
  envIntensity: 0.6,
  fogColour: '#9db6d0',
  fogDensity: 0.00008,
  skyZenith: '#2f6cc6',
  skyHorizon: '#bcd3e6',
  physicalSky: true,
  skyTurbidity: 2.5,
  skyRayleigh: 2.0,
  skyMie: 0.005,
  cloudCoverage: 0.45,
  aerialPerspective: true,
  hazeHeightFalloff: 0.004,
  hazeSunWarmth: 0.3,
  bloom: true,
  bloomStrength: 0.1,
  bloomThreshold: 2.2,
  bloomRadius: 1.5,
  shadowDistance: 400,
  screenAo: 0.45,
  bakedAo: 1,
  saturation: 1.1,
  contrast: 1.1,
  warmth: 0.012,
  blackLift: 0,
  vignette: 0.14,
  fov: 62,
  cameraShake: 1,
  smaa: true,
  cameraBlurStrength: 0.3,
  sunFlareStrength: 0.08,
  wallWeather: 0.45,
  fenceDetail: true,
  fenceHardware: true,
  crowdDetail: true,
  crowdDensity: 1,
  crowdMotion: 0.018,
  tracksideDetail: true,
  flagMotion: 0.02,
  distantLandmarks: true,
  hillDetail: 0.08,
  treeDensity: 1,
  treeBarkDetail: true,
  treeWind: 0.25,
  woodlandUndergrowth: true,
  woodlandDensity: 0.35,
  terrainColourNoise: 1,
  rubberGroove: 0.7,
  surfaceDetail: true,
  roadNormalStrength: 0.9,
  roadRepairStrength: 0.8,
  roadSkids: true,
  kerbWear: 0.7,
  lineWear: 0.6,
  terrainDetail: true,
  terrainNormalStrength: 0.28,
  mownStrength: 1,
  nearGrass: true,
  grassWind: 0.65,
  grassTuftDensity: 1,
  treeLodDistance: 160,
  propDrawDistance: 1400,
};

/**
 * Values that each quality preset forces (performance, not look). Shadows: `shadowDistance` is the
 * tier's reach in metres (the tuner's shadowDistance can only shorten it), chosen with `shadowMap` and
 * `cascades` so that the nearest cascade keeps texels of about 10 cm or less; `shadowBias` (depth) and
 * `shadowNormalBias` (metres) are matched to that texel size.
 */
export const QUALITY: Record<QualityPreset, {
  msaa: number; treeDensityScale: number; shadowMap: number; post: boolean; cascades: number; screenAo: boolean; bakedAo: boolean;
  shadowDistance: number; shadowBias: number; shadowNormalBias: number;
  physicalSky: boolean; aerialPerspective: boolean; bloom: boolean; environmentSize: number;
  detailMapSize: number; liveryAtlasSize: number; surfaceDetail: boolean; skids: boolean;
  terrainDetail: boolean; terrainMapSize: number; nearGrass: boolean; grassCapacity: number; grassRadius: number;
  treeBarkDetail: boolean; treeWind: boolean; woodlandUndergrowth: boolean; woodlandCapacity: number;
  cameraEffects: boolean; particleCapacity: number; marbleCount: number;
  wallWeather: number; fenceDetail: boolean; fenceHardware: boolean; crowdDetail: boolean; crowdMotion: boolean; tracksideDetail: boolean; distantLandmarks: boolean;
}> = {
  low: { particleCapacity: 256, marbleCount: 0, cameraEffects: false, msaa: 0, treeDensityScale: 0.45, shadowMap: 1024, shadowDistance: 40, shadowBias: -0.000002, shadowNormalBias: 0.05, post: false, physicalSky: false, aerialPerspective: false, bloom: false, environmentSize: 128, cascades: 1, screenAo: false, bakedAo: true, detailMapSize: 256, liveryAtlasSize: 512, surfaceDetail: false, skids: false, terrainDetail: false, terrainMapSize: 128, nearGrass: false, grassCapacity: 0, grassRadius: 24, treeBarkDetail: false, treeWind: false, woodlandUndergrowth: false, woodlandCapacity: 0, wallWeather: 0, fenceDetail: false, fenceHardware: false, crowdDetail: false, crowdMotion: false, tracksideDetail: false, distantLandmarks: false },
  medium: { particleCapacity: 384, marbleCount: 192, cameraEffects: false, msaa: 2, treeDensityScale: 0.75, shadowMap: 1024, shadowDistance: 100, shadowBias: -0.000002, shadowNormalBias: 0.04, post: true, physicalSky: false, aerialPerspective: true, bloom: false, environmentSize: 128, cascades: 2, screenAo: false, bakedAo: true, detailMapSize: 512, liveryAtlasSize: 1024, surfaceDetail: false, skids: true, terrainDetail: false, terrainMapSize: 256, nearGrass: false, grassCapacity: 0, grassRadius: 30, treeBarkDetail: false, treeWind: false, woodlandUndergrowth: false, woodlandCapacity: 0, wallWeather: 0.24, fenceDetail: true, fenceHardware: true, crowdDetail: true, crowdMotion: false, tracksideDetail: true, distantLandmarks: true },
  high: { particleCapacity: 512, marbleCount: 384, cameraEffects: true, msaa: 4, treeDensityScale: 1, shadowMap: 2048, shadowDistance: 400, shadowBias: -0.000002, shadowNormalBias: 0.035, post: true, physicalSky: true, aerialPerspective: true, bloom: true, environmentSize: 256, cascades: 3, screenAo: true, bakedAo: true, detailMapSize: 1024, liveryAtlasSize: 2048, surfaceDetail: true, skids: true, terrainDetail: true, terrainMapSize: 512, nearGrass: true, grassCapacity: 2048, grassRadius: 42, treeBarkDetail: true, treeWind: true, woodlandUndergrowth: true, woodlandCapacity: 768, wallWeather: 0.45, fenceDetail: true, fenceHardware: true, crowdDetail: true, crowdMotion: true, tracksideDetail: true, distantLandmarks: true },
};

const STORAGE_KEY = 'bathurst.graphics.v1';
type Listener = (cfg: GraphicsConfig, changed: (keyof GraphicsConfig)[]) => void;

let current: GraphicsConfig = { ...DEFAULT_GRAPHICS, ...loadSaved() };
const listeners = new Set<Listener>();

function loadSaved(): Partial<GraphicsConfig> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? cleanGraphics(JSON.parse(raw)) ?? {} : {};
  } catch {
    return {};
  }
}

export function getGraphics(): Readonly<GraphicsConfig> {
  return current;
}

export function setGraphics(patch: Partial<GraphicsConfig>): void {
  const clean = cleanGraphics(patch);
  if (!clean) return;
  const changed = (Object.keys(clean) as (keyof GraphicsConfig)[]).filter((k) => clean[k] !== current[k]);
  if (!changed.length) return;
  current = { ...current, ...clean };
  for (const l of listeners) l(current, changed);
}

export function onGraphicsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveGraphics(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: settings stay for this session only */
  }
}

export function resetGraphics(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  setGraphics({ ...DEFAULT_GRAPHICS });
}

/** JSON of the values that differ from the defaults (what to send back for tuning). */
export function exportGraphics(): string {
  const diff: Partial<Record<keyof GraphicsConfig, unknown>> = {};
  for (const k of Object.keys(DEFAULT_GRAPHICS) as (keyof GraphicsConfig)[]) {
    if (current[k] !== DEFAULT_GRAPHICS[k]) diff[k] = current[k];
  }
  return JSON.stringify(diff, null, 2);
}

export function importGraphics(json: string): boolean {
  try {
    const clean = cleanGraphics(JSON.parse(json));
    if (!clean) return false;
    setGraphics(clean);
    return true;
  } catch {
    return false;
  }
}

/** Unit vector towards the sun in world space (north = -Z, east = +X). */
export function sunDirection(cfg: GraphicsConfig = current): [number, number, number] {
  const sun = solarPosition(BATHURST_LOCATION, raceDay(RACE_YEAR), cfg.timeOfDay, AEDT_OFFSET_HOURS);
  const el = (sun.elevationDeg * Math.PI) / 180;
  const az = (sun.azimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

function cleanGraphics(input: unknown): Partial<GraphicsConfig> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const values = input as Record<string, unknown>;
  const clean: Partial<GraphicsConfig> = {};
  for (const key of Object.keys(DEFAULT_GRAPHICS) as (keyof GraphicsConfig)[]) {
    const value = values[key];
    if (value === undefined) continue;
    if (typeof value !== typeof DEFAULT_GRAPHICS[key]) return null;
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    if (key === 'timeOfDay' && (Number(value) < 0 || Number(value) > 24)) return null;
    if (key === 'toneMapping' && !['ACES', 'AgX', 'Neutral'].includes(String(value))) return null;
    (clean as Record<string, unknown>)[key] = value;
  }
  return clean;
}
