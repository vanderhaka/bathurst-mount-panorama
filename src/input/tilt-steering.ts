/** Relative orientation needs only accelerometer/gyroscope, not compass permission.
 * https://www.w3.org/TR/orientation-event/ — Z-X'-Y'' device coordinates. */
export interface OrientationHost extends EventTarget {
  isSecureContext: boolean;
  DeviceOrientationEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> };
  screen?: { orientation?: { angle: number } };
  orientation?: number;
}
export type TiltStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** A Centre tilt tap may move the centre this far from level, no further (a thumb pressing the button tilts the phone). */
const MAX_CENTRE_DEG = 15;

/** Gravity ("up") in the displayed screen plane, as fractions of g: right = toward the screen's right edge,
 * up = toward its top. The screen is the device frame rotated by the screen orientation angle (W3C:
 * 90 = device turned counter-clockwise). */
export function screenGravity(beta: number, gamma: number, screenAngle: number): { right: number; up: number } | null {
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return null;
  const b = beta * RAD, g = gamma * RAD, a = screenAngle * RAD;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b);
  return { right: x * Math.cos(a) - y * Math.sin(a), up: x * Math.sin(a) + y * Math.cos(a) };
}

/** Sideways tilt in degrees, positive = right edge raised: the angle of the screen's left-right axis above level.
 * It uses the sideways part of gravity alone, so holding the phone more upright or flatter does not change it
 * (an angle within the screen plane does, and grows without bound as the phone nears flat). */
export function screenRoll(beta: number, gamma: number, screenAngle: number): number | null {
  const g = screenGravity(beta, gamma, screenAngle);
  return g && Math.asin(clamp(g.right, -1, 1)) / RAD;
}

export class TiltSteering {
  status: TiltStatus = 'idle';
  private active = false;
  private listening = false;
  private disposed = false;
  private pending: Promise<TiltStatus> | null = null;
  /** Roll that steers straight: level unless the player tapped Centre tilt. */
  private neutral = 0;
  /** A Centre tilt tap is waiting for the next reading. */
  private capture = false;
  private roll = 0;
  private angle: number | null = null;
  /** Some browsers report the opposite landscape angle; the screen's top being clearly down reveals it. */
  private flipped = false;
  private age = Infinity;
  private steer = 0;
  constructor(private readonly host: OrientationHost = window as unknown as OrientationHost) {}

  /** The sole permission path, and the Centre tilt tap. Invoke synchronously in a click/tap handler. */
  enableFromTap(): Promise<TiltStatus> {
    this.centre();
    if (this.pending) return this.pending;
    if (this.status === 'granted') { this.listen(); return Promise.resolve(this.status); }
    const api = this.host.DeviceOrientationEvent;
    if (!this.host.isSecureContext || !api || this.disposed) {
      this.status = 'unavailable';
      return Promise.resolve(this.status);
    }
    this.status = 'requesting';
    try {
      // No await or timer before this call: Safari requires transient user activation.
      const request = api.requestPermission ? api.requestPermission() : Promise.resolve('granted' as const);
      this.pending = request.then((permission) => {
        this.status = permission === 'granted' ? 'granted' : 'denied';
        this.listen();
        return this.status;
      }).catch(() => { this.status = 'denied'; return this.status; }).finally(() => { this.pending = null; });
      return this.pending;
    } catch {
      this.status = 'denied';
      return Promise.resolve(this.status);
    }
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.calibrate();
    this.listen();
  }
  /** Back to level: straight ahead is the phone's left-right axis level, whatever it was doing a moment ago. */
  calibrate(): void { this.neutral = 0; this.capture = false; this.age = Infinity; this.steer = 0; }
  /** The next reading becomes straight ahead (within MAX_CENTRE_DEG of level). */
  private centre(): void { this.capture = true; this.age = Infinity; this.steer = 0; }
  get ready(): boolean { return this.active && this.age <= 0.6; }

  private listen(): void {
    const wanted = this.active && this.status === 'granted' && !this.disposed;
    if (wanted === this.listening) return;
    this.listening = wanted;
    if (wanted) this.host.addEventListener('deviceorientation', this.onReading);
    else this.host.removeEventListener('deviceorientation', this.onReading);
  }
  private readonly onReading = (event: Event): void => {
    const e = event as DeviceOrientationEvent;
    if (e.beta === null || e.gamma === null) return;
    const angle = this.host.screen?.orientation?.angle ?? this.host.orientation ?? 0;
    const g = screenGravity(e.beta, e.gamma, angle);
    if (g === null) return;
    if (this.angle !== angle) { this.flipped = false; this.neutral = 0; this.steer = 0; }
    if (Math.abs(g.up) > 0.25) this.flipped = g.up < 0;
    const roll = Math.asin(clamp(this.flipped ? -g.right : g.right, -1, 1)) / RAD;
    if (this.capture) { this.neutral = clamp(roll, -MAX_CENTRE_DEG, MAX_CENTRE_DEG); this.capture = false; this.steer = 0; }
    this.roll = roll;
    this.angle = angle;
    this.age = 0;
  };

  update(dt: number, sensitivity: number): number {
    this.age += Math.max(0, dt);
    if (!this.ready) { this.steer = 0; return 0; }
    const delta = this.roll - this.neutral;
    const range = 24 / Math.max(0.5, Math.min(2, sensitivity));
    const target = Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 1.5) / (range - 1.5));
    this.steer += (target - this.steer) * (1 - Math.exp(-14 * Math.max(0, dt)));
    return this.steer;
  }
  dispose(): void { this.disposed = true; this.setActive(false); this.listen(); }
}
