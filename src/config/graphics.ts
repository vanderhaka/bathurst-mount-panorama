// Central, tunable graphics configuration. Every visual value that a person may
// want to adjust lives here. The live tuner (F2) edits this object; `live`
// values apply at once, `rebuild` values apply after "Rebuild world".
import type { QualityPreset } from '@/render/renderer';

export interface GraphicsConfig {
  // --- live: lighting and atmosphere
  exposure: number;
  sunIntensity: number;
  sunElevationDeg: number;
  /** Compass bearing of the sun (0 = north, 90 = east). */
  sunAzimuthDeg: number;
  sunColour: string;
  hemiIntensity: number;
  hemiSky: string;
  hemiGround: string;
  envIntensity: number;
  fogColour: string;
  fogDensity: number;
  skyZenith: string;
  skyHorizon: string;
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
  sunIntensity: 3.5,
  sunElevationDeg: 29,
  sunAzimuthDeg: 318,
  sunColour: '#ffe4bd',
  hemiIntensity: 1.2,
  hemiSky: '#e2e9ee',
  hemiGround: '#7a7866',
  envIntensity: 0.4,
  fogColour: '#c0d3e2',
  fogDensity: 0.00012,
  skyZenith: '#2f6cc6',
  skyHorizon: '#bcd3e6',
  saturation: 1.0,
  contrast: 1.04,
  warmth: 0.045,
  blackLift: 0.012,
  vignette: 0.22,
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
export const QUALITY: Record<QualityPreset, { msaa: number; treeDensityScale: number; shadowMap: number; post: boolean }> = {
  low: { msaa: 0, treeDensityScale: 0.45, shadowMap: 1024, post: false },
  medium: { msaa: 4, treeDensityScale: 0.75, shadowMap: 2048, post: true },
  high: { msaa: 4, treeDensityScale: 1, shadowMap: 4096, post: true },
};

const STORAGE_KEY = 'bathurst.graphics.v1';
type Listener = (cfg: GraphicsConfig, changed: (keyof GraphicsConfig)[]) => void;

let current: GraphicsConfig = { ...DEFAULT_GRAPHICS, ...loadSaved() };
const listeners = new Set<Listener>();

function loadSaved(): Partial<GraphicsConfig> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Partial<GraphicsConfig>) : {};
  } catch {
    return {};
  }
}

export function getGraphics(): Readonly<GraphicsConfig> {
  return current;
}

export function setGraphics(patch: Partial<GraphicsConfig>): void {
  const changed = (Object.keys(patch) as (keyof GraphicsConfig)[]).filter((k) => patch[k] !== undefined && patch[k] !== current[k]);
  if (!changed.length) return;
  current = { ...current, ...patch };
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
    const parsed = JSON.parse(json) as Partial<GraphicsConfig>;
    const clean: Partial<GraphicsConfig> = {};
    for (const k of Object.keys(DEFAULT_GRAPHICS) as (keyof GraphicsConfig)[]) {
      if (k in parsed && typeof parsed[k] === typeof DEFAULT_GRAPHICS[k]) (clean as Record<string, unknown>)[k] = parsed[k];
    }
    setGraphics(clean);
    return true;
  } catch {
    return false;
  }
}

/** Unit vector towards the sun in world space (north = -Z, east = +X). */
export function sunDirection(cfg: GraphicsConfig = current): [number, number, number] {
  const el = (cfg.sunElevationDeg * Math.PI) / 180;
  const az = (cfg.sunAzimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
