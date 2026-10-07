// Single source of truth for controls. The input layer reads these tables and
// the controls-help screen displays them.

export type GameAction =
  | 'steerLeft'
  | 'steerRight'
  | 'throttle'
  | 'brake'
  | 'shiftUp'
  | 'shiftDown'
  | 'camera'
  | 'lookBack'
  | 'reset'
  | 'pause'
  | 'ghost'
  | 'racingLine'
  | 'hud'
  | 'tuner';

export interface Binding {
  action: GameAction;
  label: string;
  /** KeyboardEvent.code values. */
  keys: string[];
  /** Human-readable key names for the help screen. */
  keyLabels: string[];
  /** Standard-mapping gamepad control, if any. */
  pad?: { kind: 'button'; index: number; label: string } | { kind: 'axis'; index: number; sign: 1 | -1; label: string };
}

export const BINDINGS: Binding[] = [
  { action: 'steerLeft', label: 'Steer left', keys: ['ArrowLeft', 'KeyA'], keyLabels: ['←', 'A'], pad: { kind: 'axis', index: 0, sign: -1, label: 'Left stick' } },
  { action: 'steerRight', label: 'Steer right', keys: ['ArrowRight', 'KeyD'], keyLabels: ['→', 'D'], pad: { kind: 'axis', index: 0, sign: 1, label: 'Left stick' } },
  { action: 'throttle', label: 'Throttle', keys: ['ArrowUp', 'KeyW'], keyLabels: ['↑', 'W'], pad: { kind: 'button', index: 7, label: 'RT' } },
  { action: 'brake', label: 'Brake', keys: ['ArrowDown', 'KeyS'], keyLabels: ['↓', 'S'], pad: { kind: 'button', index: 6, label: 'LT' } },
  { action: 'shiftUp', label: 'Shift up', keys: ['KeyE', 'ShiftLeft'], keyLabels: ['E', 'Shift'], pad: { kind: 'button', index: 0, label: 'A' } },
  { action: 'shiftDown', label: 'Shift down', keys: ['KeyQ', 'ControlLeft'], keyLabels: ['Q', 'Ctrl'], pad: { kind: 'button', index: 2, label: 'X' } },
  { action: 'camera', label: 'Change camera', keys: ['KeyC'], keyLabels: ['C'], pad: { kind: 'button', index: 3, label: 'Y' } },
  { action: 'lookBack', label: 'Look back (hold)', keys: ['KeyV'], keyLabels: ['V'], pad: { kind: 'button', index: 1, label: 'B' } },
  { action: 'reset', label: 'Reset to track', keys: ['KeyR'], keyLabels: ['R'], pad: { kind: 'button', index: 8, label: 'View' } },
  { action: 'pause', label: 'Pause', keys: ['Escape', 'KeyP'], keyLabels: ['Esc', 'P'], pad: { kind: 'button', index: 9, label: 'Menu' } },
  { action: 'ghost', label: 'Toggle ghost', keys: ['KeyG'], keyLabels: ['G'], pad: { kind: 'button', index: 4, label: 'LB' } },
  { action: 'racingLine', label: 'Cycle racing line', keys: ['KeyL'], keyLabels: ['L'], pad: { kind: 'button', index: 5, label: 'RB' } },
  { action: 'hud', label: 'Toggle HUD', keys: ['KeyH'], keyLabels: ['H'] },
  { action: 'tuner', label: 'Graphics tuner', keys: ['F2'], keyLabels: ['F2'] },
];

/** Gamepad buttons used for menu navigation (standard mapping). */
export const PAD_MENU = { up: 12, down: 13, left: 14, right: 15, accept: 0, back: 1 } as const;
