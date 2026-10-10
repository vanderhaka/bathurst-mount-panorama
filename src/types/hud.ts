import type { CarKind } from '@/car/car-specs';
import type { DrivingLevel, LapRecord, SessionConfig, Settings, ShootoutMode } from '@/types/session';
import type { ShootoutAttempt, ShootoutOutcome } from '@/shootout/model';
import type { PadStyle } from '@/input/pad-style';
import type { TiltStatus } from '@/input/tilt-steering';
import type { TyreCompound } from '@/physics/tyre-state';
import type { SessionTelemetry } from '@/types/telemetry';
import type { BrakeReading } from '@/physics/brake-heat';
import type { PracticeSummary } from '@/game/arcade-best';

export type SectorState = 'none' | 'personalBest' | 'overallBest' | 'slower';

/** Everything the in-race HUD shows. The game calls Hud.update(state) every frame. */
export interface HudState {
  units: 'kmh' | 'mph';
  speedKmh: number;
  rpm: number;
  maxRpm: number;
  /** RPM where the shift lights start (first LED). */
  shiftLightStartRpm: number;
  /** RPM for the final (flashing) shift light. */
  shiftRpm: number;
  /** -1 = R, 0 = N, 1..number of forward gears (6 on Gen3, 4 on the Torana). */
  gear: number;
  gearMode: 'auto' | 'manual';
  onLimiter: boolean;
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (right) .. 1 (left)
  tcActive: boolean;
  absActive: boolean;
  lap: {
    number: number; // 1-based, 0 = out lap before first crossing
    currentS: number; // running time of the current lap
    lastS: number | null;
    bestS: number | null;
    /** Live delta to the best lap (s, + = slower). Null when there is no best lap yet. */
    deltaS: number | null;
    valid: boolean;
    currentSector: number; // 0..sectorCount-1
    sectors: Array<{ timeS: number | null; bestS: number | null; state: SectorState }>;
  };
  /** Position on the circuit 0..1 (lap fraction) for the track map. */
  progress: number;
  ghostProgress: number | null;
  /** World x/z of the player and ghost (same frame as HudTrackInfo.outline). */
  playerXZ: [number, number];
  playerHeading: number; // radians, 0 = +Z, + = towards +X
  ghostXZ: [number, number] | null;
  cornerName: string | null;
  /** Elevation of the car above the lowest point of the circuit (m) and above sea level (m). */
  elevationM: number;
  altitudeAslM: number;
  /** Recommended speed for the next corner from the racing line, km/h (null on straights). */
  nextCornerSpeedKmh: number | null;
  damage: { front: number; rear: number; left: number; right: number; engine: number; suspension: number; aero: number };
  /** Short transient banner, e.g. "TRACK LIMITS — LAP INVALIDATED", "NEW BEST LAP". */
  message: { text: string; kind: 'info' | 'warn' | 'good' | 'best' } | null;
  fps: number | null;

  // ---- Optional extras (additive). The HUD works without them.
  /** Full broadcast layout or compact speed, gear, lap time and player map. Omit = Full. */
  hudSize?: Settings['hudSize'];
  /** Start lights: number lit (0..5) during the countdown, -1 once the lights are out. Omit = no lights strip. */
  startLights?: number;
  /** Camera view: in 'cockpit' the timing tower moves below the interior mirror. */
  view?: 'outside' | 'cockpit';
  /** The player's line in the broadcast tower: race number as shown (e.g. '05'), 3-letter code, livery colour (CSS). */
  entry?: { number: string; code: string; colour: string };
  /** Lateral acceleration in g, + = towards the left (VehicleTelemetry.gLat). Feeds the tyre estimate. */
  gLat?: number;
  /** Longitudinal acceleration in g, + = accelerating (VehicleTelemetry.gLong). Feeds the tyre estimate. */
  gLong?: number;
  /** Per-wheel load (N) and combined slip use (0..1+), order FL, FR, RL, RR (VehicleTelemetry.wheels). */
  wheels?: ReadonlyArray<{ load: number; slip: number }>;
  /** Real tyre values (FL, FR, RL, RR); when present they replace the HUD's display-only estimate. */
  tyres?: ReadonlyArray<{ tempC: number; wear: number }>;
  /** Compound fitted for this session; controls the tyre temperature bands. */
  tyreCompound?: TyreCompound;
  /** Actual disc temperatures and remaining brake-force multipliers, FL/FR/RL/RR. */
  brakes?: readonly BrakeReading[];
  /** The player's car; the damage schematic draws its outline. Omit = Gen3 outline. */
  car?: CarKind;
  /** Real fuel values; when present they replace the HUD's display-only estimate. lapsLeft null = not known yet. */
  fuel?: { litres: number; lapsLeft: number | null };
  shootout?: { mode: ShootoutMode; phase: 'warmup' | 'ready' | 'timed' | 'finished'; attempt: number | null; remaining: number | null };
}

export interface HudTrackInfo {
  /** Omit these labels in legacy harnesses to retain Mount Panorama. */
  name?: string;
  city?: string;
  elevationEstimated?: boolean;
  /** Circuit centreline in world x/z, in race order (about 1500 points). */
  outline: Array<[number, number]>;
  /** Lap fractions (0..1) where sectors 2 and 3 start. Sector 1 starts at 0 (start/finish). */
  sectorStarts: number[];
  /**
   * Named corners for map labels: lap fraction + name + turn number. `place` is the named stretch
   * (HudState.cornerName) that holds the apex; the turn is shown while the car is in that place.
   */
  corners: Array<{ progress: number; name: string; place?: string; turn: number }>;
  lengthM: number;
}

export interface Hud {
  mount(container: HTMLElement, track: HudTrackInfo): void;
  update(state: HudState): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export type MenuNav = 'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'prevTab' | 'nextTab';

export interface MenuCallbacks {
  /** Player pressed "Race" on car select. */
  onStart(config: SessionConfig): void;
  onResume(): void;
  onRestart(): void;
  /** Pause menu "Reset to track": the car goes back on the racing line, repaired. */
  onResetCar(): void;
  /** Pause menu's existing results screen. */
  onResults?(): void;
  /** Completed real lap traces for the telemetry screen. */
  telemetry?(): SessionTelemetry | null;
  /** Settings "Graphics tuner" button: opens or closes the live graphics tuner (mouse). */
  onToggleTuner(): void;
  onQuitToMenu(): void;
  onSettingsChange(settings: Settings): void;
  /** The car shown on the car-select screen changed (the game updates the 3D preview). */
  onPreviewCar(car: CarKind, liveryIndex: number): void;
  /** The steering question's Tilt tap: asks the phone for motion access. Runs synchronously inside the tap. */
  onEnableTilt?(): Promise<TiltStatus>;
}

/** DOM menus: title, car select, settings, pause, controls help, results, loading. */
export interface Menus {
  mount(container: HTMLElement, callbacks: MenuCallbacks, initial: Settings): void;
  showLoading(progress: number, label: string): void;
  showTitle(): void;
  showCarSelect(): void;
  showShootout(mode: ShootoutMode): void;
  /** `practice`: an Arcade lap against the player's Arcade best for the car. */
  showShootoutResult(mode: ShootoutMode, attempt: ShootoutAttempt | null, outcome: ShootoutOutcome, error?: string, practice?: PracticeSummary): void;
  showPause(shootout?: { mode: ShootoutMode; timed: boolean }): void;
  /** Settings changed in the race (camera, racing line, ghost): menus show and start from these. */
  syncSettings(s: Settings): void;
  /** Controller family of the connected gamepad: menus show its button names (Xbox or PlayStation). */
  setPadStyle(style: PadStyle): void;
  /** `level`: the driving level whose best laps the cards show (Experienced when absent). */
  showResults(laps: LapRecord[], bestByCar: Partial<Record<CarKind, LapRecord>>, level?: DrivingLevel): void;
  hide(): void;
  isOpen(): boolean;
  /** Gamepad navigation forwarded by the game's input layer (keyboard is handled by the menus). */
  nav(action: MenuNav): void;
  /** Number of livery presets offered per car. */
  readonly liveryCount: number;
  dispose(): void;
}
