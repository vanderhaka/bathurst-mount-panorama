import { BINDINGS, PAD_MENU, type GameAction } from '@/input/bindings';
import { padStyleOf, type PadStyle } from '@/input/pad-style';
import type { TiltStatus } from '@/input/tilt-steering';
import type { TouchControls } from '@/input/touch-controls';
import { DEFAULT_TOUCH_OPTIONS, type TouchOptions } from '@/input/touch-model';
import type { MenuNav } from '@/types/hud';

/** Raw driver controls this frame (before assists). steer: +1 = full left. */
export interface DriverControls {
  steer: number;
  throttle: number;
  brake: number;
  /** True when the steer value comes from an analog stick (no keyboard smoothing). */
  analogSteer: boolean;
}

const AXIS_DEADZONE = 0.09;
/** Stick response exponent at sensitivity 1: precise near centre, full lock at the end. */
const PAD_STEER_EXP = 1.55;
const TRIGGER_DEADZONE = 0.04;

/**
 * Keyboard + Gamepad API + touch input. Analog values are polled every frame; actions
 * are edge-triggered and consumed with `consume(action)`. The last device used drives.
 */
export class InputManager {
  device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  /** On-screen touch controls (touch screens only). */
  private touch: TouchControls | null = null;
  private touchOptions: TouchOptions = { ...DEFAULT_TOUCH_OPTIONS };
  private manualGears = false;
  /** Steering sensitivity per device, from Settings > Steering (1 = default, 0.5 to 2). */
  readonly steerSensitivity = { keyboard: 1, pad: 1, touch: 1 };
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<GameAction>();
  private readonly padPrev = new Map<number, boolean>();
  private readonly menuQueue: MenuNav[] = [];
  private kbSteer = 0;
  private kbThrottle = 0;
  private kbBrake = 0;
  private stickNavCooldown = 0;
  private readonly codeToAction = new Map<string, GameAction>();
  /** Set by the game: when true, game keys are ignored (menus own the keyboard). */
  menusOpen = false;
  /** Family of the last gamepad seen (prompts show its button names); kept when it disconnects. */
  padStyle: PadStyle = 'xbox';
  private padId = '';

  constructor(private readonly target: Window = window) {
    for (const b of BINDINGS) for (const k of b.keys) this.codeToAction.set(k, b.action);
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // Typing in a text field (the graphics tuner's number boxes) is not game input.
    if (typeof HTMLInputElement !== 'undefined' && e.target instanceof HTMLInputElement) return;
    const action = this.codeToAction.get(e.code);
    if (action === 'tuner') {
      this.pressed.add('tuner');
      e.preventDefault();
      return;
    }
    if (this.menusOpen) return;
    if (action) e.preventDefault();
    if (!e.repeat && action) this.pressed.add(action);
    this.keys.add(e.code);
    this.device = 'keyboard';
  };

  /** Connects the on-screen touch controls; their buttons become actions while racing. */
  attachTouch(touch: TouchControls): void {
    this.touch = touch;
    touch.configure(this.touchOptions, this.manualGears);
    touch.onAction = (action) => {
      if (!this.menusOpen) this.pressed.add(action);
    };
  }

  /** Touch-only options apply on attach and when Settings changes. No permission request. */
  configureTouch(options: TouchOptions, manualGears = false): void {
    this.touchOptions = { ...options };
    this.manualGears = manualGears;
    this.touch?.configure(this.touchOptions, manualGears);
  }

  /** Asks the phone for motion access (tilt steering). Call it synchronously inside a tap. */
  enableTilt(): Promise<TiltStatus> {
    return this.touch?.enableTilt() ?? Promise.resolve('unavailable');
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = () => {
    this.keys.clear();
  };

  private held(action: GameAction): boolean {
    const b = BINDINGS.find((x) => x.action === action);
    return !!b && b.keys.some((k) => this.keys.has(k));
  }

  /** Returns true once per press of the action (keyboard or gamepad). */
  consume(action: GameAction): boolean {
    const had = this.pressed.has(action);
    this.pressed.delete(action);
    return had;
  }

  /** True while the action is held (keyboard or gamepad button). */
  isHeld(action: GameAction): boolean {
    if (this.held(action)) return true;
    const b = BINDINGS.find((x) => x.action === action);
    const pad = this.pad();
    if (!pad || !b?.pad || b.pad.kind !== 'button') return false;
    return !!pad.buttons[b.pad.index]?.pressed;
  }

  /** Menu navigation events from the gamepad (D-pad, left stick, A/B). */
  takeMenuNav(): MenuNav | undefined {
    return this.menuQueue.shift();
  }

  private pad(): Gamepad | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  get gamepadConnected(): boolean {
    return this.pad() !== null;
  }

  /** Polls devices. Call once per frame before reading controls. */
  update(dt: number): DriverControls {
    const pad = this.pad();
    if (this.touch?.touched) {
      this.touch.touched = false;
      this.device = 'touch';
    }
    let padSteer = 0, padThrottle = 0, padBrake = 0;
    if (pad && pad.id !== this.padId) {
      this.padId = pad.id;
      this.padStyle = padStyleOf(pad.id);
    }
    if (pad) {
      for (const b of BINDINGS) {
        if (b.pad?.kind !== 'button') continue;
        const now = !!pad.buttons[b.pad.index]?.pressed;
        const key = b.pad.index;
        if (now && !this.padPrev.get(key)) {
          if (!this.menusOpen || b.action === 'pause') this.pressed.add(b.action);
          this.device = 'gamepad';
        }
      }
      // Menu navigation edges.
      for (const [nav, idx] of Object.entries(PAD_MENU) as Array<[MenuNav, number]>) {
        const now = !!pad.buttons[idx]?.pressed;
        if (now && !this.padPrev.get(100 + idx) && this.menusOpen) this.menuQueue.push(nav);
        this.padPrev.set(100 + idx, now);
      }
      for (const b of BINDINGS) if (b.pad?.kind === 'button') this.padPrev.set(b.pad.index, !!pad.buttons[b.pad.index]?.pressed);
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      this.stickNavCooldown -= dt;
      if (this.menusOpen && this.stickNavCooldown <= 0 && Math.hypot(ax, ay) > 0.6) {
        this.menuQueue.push(Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up');
        this.stickNavCooldown = 0.22;
      }
      const raw = Math.abs(ax) < AXIS_DEADZONE ? 0 : (Math.abs(ax) - AXIS_DEADZONE) / (1 - AXIS_DEADZONE);
      // Response curve: a higher sensitivity flattens it (more steering near centre); full stick stays full lock.
      padSteer = raw === 0 ? 0 : -Math.sign(ax) * Math.pow(raw, PAD_STEER_EXP / this.steerSensitivity.pad);
      const trig = (i: number) => {
        const v = pad.buttons[i]?.value ?? 0;
        return v < TRIGGER_DEADZONE ? 0 : (v - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE);
      };
      padThrottle = trig(7);
      padBrake = trig(6);
      if (Math.abs(padSteer) > 0.05 || padThrottle > 0.05 || padBrake > 0.05) this.device = 'gamepad';
    }

    // Keyboard: ramp digital keys into smooth analog values.
    const left = this.held('steerLeft'), right = this.held('steerRight');
    const target = (left ? 1 : 0) - (right ? 1 : 0);
    const steerRate = (target === 0 ? 5.5 : Math.sign(target) !== Math.sign(this.kbSteer) && this.kbSteer !== 0 ? 7 : 3.2) * this.steerSensitivity.keyboard;
    this.kbSteer += Math.max(-steerRate * dt, Math.min(steerRate * dt, target - this.kbSteer));
    this.kbThrottle += Math.max(-8 * dt, Math.min(6 * dt, (this.held('throttle') ? 1 : 0) - this.kbThrottle));
    this.kbBrake += Math.max(-10 * dt, Math.min(9 * dt, (this.held('brake') ? 1 : 0) - this.kbBrake));

    if (this.touch) this.touch.sensitivity = this.steerSensitivity.touch;
    const touch = this.touch?.update(dt, this.device === 'touch' && !this.menusOpen);
    if (this.device === 'touch' && touch) return { ...touch, analogSteer: true };
    if (this.device === 'gamepad' && pad) {
      return { steer: padSteer, throttle: padThrottle, brake: padBrake, analogSteer: true };
    }
    return { steer: this.kbSteer, throttle: this.kbThrottle, brake: this.kbBrake, analogSteer: false };
  }

  /** Dual-rumble feedback (kerbs, impacts). Silently ignored when unsupported. */
  rumble(strong: number, weak: number, ms: number): void {
    const pad = this.pad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null;
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
