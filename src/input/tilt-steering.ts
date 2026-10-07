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
const wrap = (angle: number): number => ((angle + 180) % 360 + 360) % 360 - 180;

/** Gravity projected into the displayed screen plane: positive = right edge raised.
 * Euler beta/gamma alone change sign across the two landscape orientations. */
export function screenRoll(beta: number, gamma: number, screenAngle: number): number | null {
  if (![beta, gamma, screenAngle].every(Number.isFinite)) return null;
  const b = beta * RAD, g = gamma * RAD, a = screenAngle * RAD;
  const x = -Math.cos(b) * Math.sin(g), y = Math.sin(b);
  const right = x * Math.cos(a) + y * Math.sin(a);
  const up = -x * Math.sin(a) + y * Math.cos(a);
  return Math.hypot(right, up) < 0.12 ? null : Math.atan2(right, up) / RAD;
}

export class TiltSteering {
  status: TiltStatus = 'idle';
  private active = false;
  private listening = false;
  private disposed = false;
  private pending: Promise<TiltStatus> | null = null;
  private neutral: number | null = null;
  private roll = 0;
  private angle: number | null = null;
  private age = Infinity;
  private steer = 0;
  constructor(private readonly host: OrientationHost = window as unknown as OrientationHost) {}

  /** The sole permission path. Invoke synchronously in a click/tap handler. */
  enableFromTap(): Promise<TiltStatus> {
    this.calibrate();
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
  calibrate(): void { this.neutral = null; this.age = Infinity; this.steer = 0; }
  get ready(): boolean { return this.active && this.neutral !== null && this.age <= 0.6; }

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
    const roll = screenRoll(e.beta, e.gamma, angle);
    if (roll === null) return;
    if (this.angle !== angle || this.neutral === null || this.age > 0.6) {
      this.neutral = roll;
      this.steer = 0;
    }
    this.roll = roll;
    this.angle = angle;
    this.age = 0;
  };

  update(dt: number, sensitivity: number): number {
    this.age += Math.max(0, dt);
    if (!this.ready) { this.steer = 0; return 0; }
    const delta = wrap(this.roll - this.neutral!);
    const range = 24 / Math.max(0.5, Math.min(2, sensitivity));
    const target = Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 1.5) / (range - 1.5));
    this.steer += (target - this.steer) * (1 - Math.exp(-14 * Math.max(0, dt)));
    return this.steer;
  }
  dispose(): void { this.disposed = true; this.setActive(false); this.listen(); }
}
