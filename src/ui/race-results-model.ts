// Race results: the text for each cell and the headline. Pure, so it is unit-tested in node.
import type { CarKind } from '@/car/car-specs';
import { formatLapTime } from '@/hud/format';
import type { AiSkill, RaceResult, RaceRow } from '@/types/race';

/** Three-letter car codes, as on the in-race tower. */
export const CAR_CODES: Record<CarKind, string> = { camaro: 'CAM', mustang: 'MUS', supra: 'SUP', torana: 'A9X' };

export const SKILL_LABEL: Record<AiSkill, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** 1 -> 1st, 2 -> 2nd, 11 -> 11th, 23 -> 23rd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Leader: finish time. Others: the gap, or laps down. Not finished and no gap yet: Running. */
export function timeCell(row: RaceRow): string {
  if (row.lapsDown > 0) return `+${row.lapsDown} ${row.lapsDown === 1 ? 'lap' : 'laps'}`;
  if (row.finished && row.finishTimeS !== null && row.gapS === null) return formatLapTime(row.finishTimeS);
  if (row.gapS !== null) return `+${row.gapS < 60 ? row.gapS.toFixed(3) : formatLapTime(row.gapS)}`;
  return 'Running';
}

export function bestLapCell(row: RaceRow): string {
  return row.bestLapS === null ? '—' : formatLapTime(row.bestLapS);
}

export interface RaceHeadline {
  title: string;
  sub: string;
  /** The player has taken the flag. */
  finished: boolean;
}

export function raceHeadline(result: RaceResult): RaceHeadline {
  const you = result.rows.find((r) => r.isPlayer);
  const skill = `${SKILL_LABEL[result.skill]} AI`;
  if (you?.finished) return { title: `You finished P${you.position}`, sub: `${result.circuit} · ${result.laps} ${result.laps === 1 ? 'lap' : 'laps'} · ${skill}`, finished: true };
  const lap = Math.min(result.laps, (you?.lapsDone ?? 0) + 1);
  return { title: 'Running order', sub: `Lap ${lap} of ${result.laps} · ${skill}`, finished: false };
}
