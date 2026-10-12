import type { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import type { RacingLine } from '@/track/racing-line';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';

export type AiState = 'line' | 'follow' | 'pass' | 'side';

const DECISION_DT = 1 / 30;
/** Cars further ahead than this are ignored (m, along the track). */
const LOOK_AHEAD_M = 60;
/** ... stretched to the braking distance at 5 m/s^2 (plus 30 m) so a stopped car is seen in time at speed. */
const LOOK_BRAKE_MPS2 = 5;
/** A pass starts once the gap to the slower car is under this (m), or the look-ahead for a stuck car. */
const PASS_GAP_M = 45;
const STUCK_MPS = 5;
/** No racing passes at crawling speed (the first corner of a standing start, a hairpin). */
const MIN_PASS_MPS = 40;
const G = 9.81;
/** Curvature (1/m) above which the speed cap may only ease the car down, by at most CORNER_EASE_MPS below its speed. */
const CORNER_CURVATURE = 1 / 400;
const CORNER_EASE_MPS = 2;
/** Deceleration planned for when closing on a car (m/s^2), well inside what the car can do. */
const BRAKE_MPS2 = 7;
/** How far ahead the follow rule projects a braking lead car (s). */
const LEAD_HORIZON_S = 1.2;
/** Seconds held up behind a slower car before a pass starts. */
const HELD_PASS_S = 1;
/** A pass that has not finished after this long is abandoned (s). */
const MAX_PASS_S = 25;
/** Extra pace fraction while passing in a clear lane. */
const PASS_COMMIT = 0.05;
/** Distance kept from the road edge when moving off the line (m). */
const EDGE_MARGIN_M = 0.9;
/** Distance kept from a barrier face (m): the car's half width plus a little. */
const WALL_MARGIN_M = 1.7;
/** Lateral slew of the offset target (m/s). */
const OFFSET_RATE = 2;
/** Faster slew back towards the line, where the road is about to run out (m/s). */
const RETURN_RATE = 4;
/** Room kept between bodies when passing / running alongside (m). */
const PASS_CLEARANCE_M = 0.6;
const SIDE_CLEARANCE_M = 0.4;
/** A car whose lateral gap to us is under both half widths plus this is in our path (m). */
const IN_PATH_M = 0.3;
/** A pass is dropped when the lane left is narrower than both half widths plus this (m). */
const ABORT_M = 0.1;
/** A pass only starts where the line curvature stays under this (1/m); stuck cars are always passed. */
const MAX_PASS_CURVATURE = 1 / 120;
/** A pass that has not reached its lane is dropped when the line gets tighter than this within ~0.7 s (1/m). */
const TIGHT_CURVATURE = 1 / 120;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An Autopilot with traffic manners: it follows a slower car at a speed-dependent gap, moves its line
 * offset sideways to pass where there is room, and never steers into a car alongside. Decisions run at
 * 30 Hz; steering and speed control run on every call (the physics step rate).
 */
export class AiDriver {
  readonly pilot: Autopilot;
  private readonly basePace: number;
  /** Follow-rule gain (1/s) and extra gap (m), varied per car by the seed. */
  private readonly gain: number;
  private readonly gapExtra: number;
  /** Braking the follow rule plans with (m/s^2): varied per car. */
  private readonly brake: number;
  private lastDecision = -Infinity;
  private lastT = NaN;
  private want = 0;
  private passSide = 0;
  private heldT = 0;
  private passT = 0;
  private passCar: Vehicle | null = null;
  private current: AiState = 'line';

  constructor(private readonly track: Track, private readonly line: RacingLine, private readonly profile: SpeedProfile, pace: number, seed: number) {
    const rnd = mulberry32(seed);
    this.basePace = pace * (1 + (rnd() - 0.5) * 0.02);
    this.gain = 0.5 * (1 + (rnd() - 0.5) * 0.3);
    this.gapExtra = rnd() * 2;
    this.brake = BRAKE_MPS2 * (1 + (rnd() - 0.5) * 0.2);
    this.pilot = new Autopilot(track, line, profile);
    this.pilot.pace = this.basePace;
  }

  get state(): AiState { return this.current; }

  /** `others` = every other car on the track (the player included). */
  drive(self: Vehicle, others: readonly Vehicle[], out: VehicleInput): VehicleInput {
    const t = self.simulationS;
    if (t < this.lastDecision || t - this.lastDecision >= DECISION_DT) {
      this.lastDecision = t;
      this.decide(self, others);
    }
    const dt = Number.isFinite(this.lastT) && t > this.lastT ? Math.min(0.1, t - this.lastT) : 1 / 360;
    this.lastT = t;
    const pilot = this.pilot, step = (Math.abs(this.want) < Math.abs(pilot.offset) ? RETURN_RATE : OFFSET_RATE) * dt;
    const move = Math.max(-step, Math.min(step, this.want - pilot.offset));
    pilot.offset += move;
    pilot.offsetRate = move / dt;
    return pilot.drive(self, out);
  }

  /** Signed s difference other - self, wrapped into (-length/2, length/2]. */
  private ds(self: Vehicle, o: Vehicle): number {
    const L = this.track.length;
    let d = o.tp.s - self.tp.s;
    if (d > L / 2) d -= L;
    else if (d < -L / 2) d += L;
    return d;
  }

  /** Fastest speed from which we still stop `room` metres short of a car moving at `vl`, braking at BRAKE_MPS2. */
  private safeSpeed(vl: number, room: number): number {
    return Math.sqrt(vl * vl + 2 * this.brake * Math.max(0, room));
  }

  /** A car's speed a moment from now: where it is braking hard, follow what it is about to do, not what it did. */
  private expected(o: Vehicle): number {
    return Math.max(0, o.speed + Math.min(0, o.telemetry.gLong) * G * LEAD_HORIZON_S);
  }

  /** Half the lateral extent of a car's rectangle across the track, given its heading against the road. */
  private latHalf(o: Vehicle): number {
    const { tx, tz } = this.track, i = o.tp.index, sin = Math.sin(o.heading), cos = Math.cos(o.heading);
    const c = Math.abs(tx[i] * sin + tz[i] * cos), s = Math.abs(tx[i] * cos - tz[i] * sin);
    const dim = o.spec.dimensions;
    return 0.5 * (dim.length * s + dim.width * c);
  }

  private decide(self: Vehicle, others: readonly Vehicle[]): void {
    const { track, line, profile, pilot } = this;
    const L = self.spec.dimensions.length, half = this.latHalf(self);
    const n = track.n, i = Math.floor(self.tp.s / track.spacing) % n;
    const lineD = line.offset[i];
    const speed = self.speed;
    const lookAhead = Math.min(220, Math.max(LOOK_AHEAD_M, 30 + (speed * speed) / (2 * LOOK_BRAKE_MPS2)));
    // Room for the offset over the next ~2 s, in offset space: the offset slews at 2 m/s and the line itself
    // crosses the road, so a fixed offset can run off the road later. The line itself always stays allowed.
    // The margins grow with speed: the car wanders more about its target at 80 m/s.
    const em = EDGE_MARGIN_M + 0.02 * speed, wm = WALL_MARGIN_M + 0.02 * speed;
    let offHi = Infinity, offLo = -Infinity;
    const step = Math.max(track.spacing, 12), reach = Math.max(30, speed * 2);
    for (let dist = 0; dist <= reach; dist += step) {
      const m = (i + Math.round(dist / track.spacing)) % n;
      // The offset can shrink by RETURN_RATE on the way there, so a later squeeze binds less.
      const slack = (RETURN_RATE * dist) / Math.max(10, speed);
      const hi = Math.min(track.left.edge[m] - em, track.left.wall[m] - wm) - line.offset[m] + slack;
      const lo = -Math.min(track.right.edge[m] - em, track.right.wall[m] - wm) - line.offset[m] - slack;
      offHi = Math.min(offHi, Math.max(0, hi));
      offLo = Math.max(offLo, Math.min(0, lo));
    }

    // The car being passed stays the reference until it is clearly behind.
    if (this.passCar) {
      const d = this.ds(self, this.passCar);
      this.passT += DECISION_DT;
      // Done once clearly behind; give up a pass that goes nowhere (an equal-paced car) or whose car is far ahead.
      // A pass not yet in its lane is dropped before a tight corner (no late dive).
      const tight = d > L + 2 && Math.abs(pilot.offset) < 1.5 && !this.straightAhead(self.tp.s, 15 + speed * 0.7, TIGHT_CURVATURE);
      if (d < -(L + 4) || d > lookAhead || this.passT > MAX_PASS_S || tight) { this.passCar = null; this.passSide = 0; this.heldT = -MAX_PASS_S / 2; }
    }
    // Nearest car ahead in our path, and the cars close enough in s to constrain our lateral position.
    let lead: Vehicle | null = null, leadDs = Infinity;
    let hardLo = -Infinity, hardHi = Infinity, side = false, nearCap = Infinity;
    for (const o of others) {
      if (o === self) continue;
      const ds = this.ds(self, o), dd = o.tp.d - self.tp.d, oh = this.latHalf(o);
      // Never close fast on a car just outside our path (it may swing across): a loose cap on top of the follow rule.
      if (ds > L && ds < 40 && Math.abs(dd) < half + oh + 0.45) nearCap = Math.min(nearCap, this.safeSpeed(this.expected(o), ds - L - 4));
      if (ds > L + 0.8 && ds < lookAhead && Math.abs(dd) < half + oh + IN_PATH_M && ds < leadDs) { lead = o; leadDs = ds; }
      if (ds > -(L + 4) && ds < L + 0.8 && Math.abs(dd) < half + oh + 1.5) {
        // Alongside (or just behind after a pass): keep the lateral gap, never close it.
        side = true;
        const need = half + oh + SIDE_CLEARANCE_M;
        if (dd > 0) hardHi = Math.min(hardHi, o.tp.d - need);
        else hardLo = Math.max(hardLo, o.tp.d + need);
      }
    }
    let cap = Infinity, state: AiState = side ? 'side' : 'line';
    if (lead) {
      const vl = this.expected(lead), gap = leadDs - L;
      const minGap = 6 + 0.2 * vl + this.gapExtra;
      cap = Math.min(Math.max(0, vl + this.gain * (gap - minGap)), this.safeSpeed(vl, gap - minGap));
      state = 'follow';
      const ka = Math.round((self.tp.s + Math.max(2, speed * 0.3)) / track.spacing) % n;
      const stuck = lead.speed < STUCK_MPS && speed > 10; // at a standstill (the grid) everyone is slow
      // Held up: close behind a car slower than we want to go. Only a sustained spell triggers a pass, so
      // cars running at the same pace do not weave around each other.
      const held = profile.speed[ka] * this.basePace > lead.speed + 1.5 && gap < minGap + 14;
      this.heldT = held ? this.heldT + DECISION_DT : Math.max(0, this.heldT - DECISION_DT);
      if (!this.passCar && (stuck ? gap < lookAhead : this.heldT > HELD_PASS_S && gap < PASS_GAP_M && speed > MIN_PASS_MPS) && (stuck || this.straightAhead(self.tp.s, leadDs + 30))) {
        this.heldT = 0;
        const clear = half + this.latHalf(lead) + PASS_CLEARANCE_M;
        const roomL = offHi - (lead.tp.d + clear - lineD), roomR = lead.tp.d - clear - lineD - offLo;
        if (Math.max(roomL, roomR) > -0.3) { this.passCar = lead; this.passT = 0; this.passSide = roomL >= roomR ? 1 : -1; }
      }
    }
    if (this.passCar) {
      const pc = this.passCar, clear = half + this.latHalf(pc) + PASS_CLEARANCE_M;
      const sep = (side: number): number => {
        this.want = this.fit(pc.tp.d + side * clear - lineD, hardLo - lineD, hardHi - lineD, offLo, offHi);
        return side * (lineD + this.want - pc.tp.d);
      };
      state = 'pass';
      // The road ran out on the pass side. Still behind the car and near the line: try the other side. Otherwise drop back in line.
      if (sep(this.passSide) < half + this.latHalf(pc) + ABORT_M) {
        if (this.ds(self, pc) > L + 3 && Math.abs(pilot.offset) < 1.5 && sep(-this.passSide) >= half + this.latHalf(pc) + ABORT_M) this.passSide = -this.passSide;
        else {
          this.passCar = null; this.passSide = 0; this.heldT = -3;
          this.want = this.fit(0, hardLo - lineD, hardHi - lineD, offLo, offHi);
          state = lead ? 'follow' : 'line';
        }
      }
    } else {
      this.want = this.fit(0, hardLo - lineD, hardHi - lineD, offLo, offHi);
    }
    this.current = state;
    // Curvature of the line a little ahead.
    const kc = Math.round((self.tp.s + Math.max(2, speed * 0.3)) / track.spacing) % n;
    const bend = Math.abs(line.curvature[kc]);
    // In a corner a cap well under the current speed would brake the car past its grip: ease down instead.
    const capped = Math.min(cap, nearCap);
    pilot.speedCap = bend > CORNER_CURVATURE ? Math.max(capped, speed - CORNER_EASE_MPS) : capped;
    // Back off a little while off the line in a corner: the grip there is less certain.
    const corner = Math.min(1, bend * 150);
    // Commit a little harder (later braking) once alongside in a clear lane, the way a driver does to complete a pass.
    const commit = state === 'pass' && cap === Infinity ? PASS_COMMIT : 0;
    pilot.pace = this.basePace * (1 + commit - 0.03 * Math.min(1, Math.abs(pilot.offset) / 2) * corner);
  }

  /** Target offset kept clear of neighbours (lo..hi), then inside the road limits, which always win. */
  private fit(want: number, lo: number, hi: number, roadLo: number, roadHi: number): number {
    return Math.min(roadHi, Math.max(roadLo, Math.min(hi, Math.max(lo, want))));
  }

  /** True when the line is nearly straight from s to s + len. */
  private straightAhead(s: number, len: number, limit = MAX_PASS_CURVATURE): boolean {
    const { track, line } = this;
    for (let k = 0; k <= len; k += track.spacing * 2) {
      if (Math.abs(line.curvature[Math.floor(track.wrapS(s + k) / track.spacing) % track.n]) > limit) return false;
    }
    return true;
  }
}
