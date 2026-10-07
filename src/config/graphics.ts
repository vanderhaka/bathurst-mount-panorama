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
  // --- rebuild: world content
  treeDensity: number;
  terrainColourNoise: number;
  /** Darkness of the rubbered-in racing groove on the asphalt (0..1). */
  rubberGroove: number;
  grassTuftDensity: number;
  /** Distance at which trees switch to the low-detail mesh (m). */
  treeLodDistance: number;
  /** Trees and props beyond this distance are not drawn (m). */
  propDrawDistance: number;
}

export const DEFAULT_GRAPHICS: GraphicsConfig = {
  exposure: 1.0,
  // Highest mean in the independent 12-view operator comparison (docs/REALISM.md).
  toneMapping: 'AgX',
  timeOfDay: 15,
  sunIntensity: 3.5,
  sunColour: '#fff0da',
  hemiIntensity: 1.2,
  hemiSky: '#e2e9ee',
  hemiGround: '#7a7866',
  envIntensity: 0.4,
  fogColour: '#c0d3e2',
  fogDensity: 0.00014,
  skyZenith: '#2f6cc6',
  skyHorizon: '#bcd3e6',
  physicalSky: true,
  skyTurbidity: 2.5,
  skyRayleigh: 1.5,
  skyMie: 0.004,
  cloudCoverage: 0.26,
  aerialPerspective: true,
  hazeHeightFalloff: 0.004,
  hazeSunWarmth: 0.3,
  bloom: true,
  bloomStrength: 0.1,
  bloomThreshold: 2.2,
  bloomRadius: 1.5,
  saturation: 1.0,
  contrast: 1.04,
  warmth: 0.012,
  blackLift: 0.004,
  vignette: 0.14,
  fov: 62,
  cameraShake: 1,
  treeDensity: 1,
  terrainColourNoise: 1,
  rubberGroove: 0.55,
  grassTuftDensity: 1,
  treeLodDistance: 160,
  propDrawDistance: 1400,
};

/** Values that each quality preset forces (performance, not look). */
export const QUALITY: Record<QualityPreset, {
  msaa: number; treeDensityScale: number; shadowMap: number; post: boolean;
  physicalSky: boolean; aerialPerspective: boolean; bloom: boolean; environmentSize: number;
}> = {
  low: { msaa: 0, treeDensityScale: 0.45, shadowMap: 1024, post: false, physicalSky: false, aerialPerspective: false, bloom: false, environmentSize: 128 },
  medium: { msaa: 4, treeDensityScale: 0.75, shadowMap: 2048, post: true, physicalSky: false, aerialPerspective: true, bloom: false, environmentSize: 128 },
  high: { msaa: 4, treeDensityScale: 1, shadowMap: 4096, post: true, physicalSky: true, aerialPerspective: true, bloom: true, environmentSize: 256 },
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
