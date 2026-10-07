// Controls-help data, read from the input layer's single binding table.
import { BINDINGS, type GameAction } from '@/input/bindings';

export interface KeyRow {
  label: string;
  /** Alternatives ("or"); each alternative is one or more keys shown together. */
  keys: string[][];
}

/** Keyboard rows. Steer left/right are merged into one "Steer" row. */
export function keyboardRows(): KeyRow[] {
  const rows: KeyRow[] = [];
  const left = BINDINGS.find((b) => b.action === 'steerLeft');
  const right = BINDINGS.find((b) => b.action === 'steerRight');
  if (left && right) {
    rows.push({ label: 'Steer', keys: left.keyLabels.map((k, i) => [k, right.keyLabels[i]].filter(Boolean)) });
  }
  for (const b of BINDINGS) {
    if (b.action === 'steerLeft' || b.action === 'steerRight') continue;
    rows.push({ label: b.label, keys: b.keyLabels.map((k) => [k]) });
  }
  return rows;
}

/** Gamepad control label -> action label (e.g. "RT" -> "Throttle"). Left stick merged into "Steer". */
export function padLabels(): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of BINDINGS) {
    if (!b.pad) continue;
    const isSteer = b.action === 'steerLeft' || b.action === 'steerRight';
    out.set(b.pad.label, isSteer ? 'Steer' : b.label);
  }
  return out;
}

export function actionLabel(action: GameAction): string {
  return BINDINGS.find((b) => b.action === action)?.label ?? action;
}
