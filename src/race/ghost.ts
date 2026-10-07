/**
 * Ghost car: records the car pose at a fixed rate during a lap, keeps the best
 * valid lap, and replays it by lap time. Poses are stored as one Float32Array
 * (x, y, z, heading, pitch, roll, steer, speed per frame) so that the best lap
 * can be saved to localStorage compactly.
 */
export const GHOST_RATE = 30; // samples per second
const STRIDE = 8;

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
  steer: number;
  speed: number;
}

export class GhostRecorder {
  private buf: number[] = [];
  private acc = 0;

  reset(): void {
    this.buf = [];
    this.acc = 0;
  }

  /**
   * Adds samples at exactly GHOST_RATE per second of game time. The accumulator
   * keeps its remainder (resetting it would stretch the sample period and make
   * the replay run fast).
   */
  record(dt: number, p: GhostPose): void {
    const period = 1 / GHOST_RATE;
    if (this.buf.length === 0) {
      this.push(p);
      this.acc = 0;
      return;
    }
    this.acc += dt;
    while (this.acc >= period) {
      this.push(p);
      this.acc -= period;
    }
  }

  private push(p: GhostPose): void {
    this.buf.push(p.x, p.y, p.z, p.heading, p.pitch, p.roll, p.steer, p.speed);
  }

  take(): Float32Array {
    const out = Float32Array.from(this.buf);
    this.reset();
    return out;
  }
}

export class GhostPlayer {
  constructor(readonly data: Float32Array) {}

  get duration(): number {
    return this.data.length / STRIDE / GHOST_RATE;
  }

  /** Pose at lap time t (interpolated). Returns false when t is beyond the recording. */
  poseAt(t: number, out: GhostPose): boolean {
    const frames = this.data.length / STRIDE;
    const f = t * GHOST_RATE;
    if (f < 0 || f >= frames - 1) return false;
    const i = Math.floor(f), k = f - i;
    const a = i * STRIDE, b = a + STRIDE, d = this.data;
    const lerp = (o: number) => d[a + o] + (d[b + o] - d[a + o]) * k;
    out.x = lerp(0);
    out.y = lerp(1);
    out.z = lerp(2);
    let dh = d[b + 3] - d[a + 3];
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    out.heading = d[a + 3] + dh * k;
    out.pitch = lerp(4);
    out.roll = lerp(5);
    out.steer = lerp(6);
    out.speed = lerp(7);
    return true;
  }
}

/** Base64 encoding of a Float32Array (for localStorage). */
export function encodeGhost(data: Float32Array): string {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function decodeGhost(text: string): Float32Array | null {
  try {
    const s = atob(text);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new Float32Array(bytes.buffer);
  } catch {
    return null;
  }
}
