// Player-vs-AI race: options chosen in the menu, the live field for the HUD, and the classification for results.
import type { CarKind } from '@/car/car-specs';

/** AI pace: Easy and Medium leave room for a new player; Hard is near the AI's clean limit. */
export type AiSkill = 'easy' | 'medium' | 'hard';

export interface RaceOptions {
  /** AI cars on the grid with the player (the player starts last). */
  opponents: number;
  laps: number;
  skill: AiSkill;
}

export const RACE_OPPONENTS: readonly number[] = [3, 5, 7];
export const RACE_LAPS: readonly number[] = [3, 5, 10];
export const AI_SKILLS: readonly AiSkill[] = ['easy', 'medium', 'hard'];
export const DEFAULT_RACE_OPTIONS: Readonly<RaceOptions> = { opponents: 5, laps: 3, skill: 'medium' };

/** One car in the running order. */
export interface RaceRow {
  position: number;
  /** Race number as painted on the car ('97', '05'). */
  number: string;
  /** Fictional driver name; the player's row says 'You'. */
  name: string;
  car: CarKind;
  isPlayer: boolean;
  lapsDone: number;
  finished: boolean;
  finishTimeS: number | null;
  /** Seconds behind the leader; null for the leader or while unknown. */
  gapS: number | null;
  lapsDown: number;
  bestLapS: number | null;
}

/** Live race state for the HUD. */
export interface RaceHud {
  position: number;
  total: number;
  /** Lap the player is on, 1-based, capped at `laps`. */
  lap: number;
  laps: number;
  /** The player has taken the chequered flag. */
  finished: boolean;
  rows: readonly RaceRow[];
}

/** The classification shown on the race results screen. */
export interface RaceResult {
  circuit: string;
  laps: number;
  skill: AiSkill;
  rows: readonly RaceRow[];
}
