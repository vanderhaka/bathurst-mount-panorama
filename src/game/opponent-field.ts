import type * as THREE from 'three';
import { circuitCarSpec, type CarKind } from '@/car/car-specs';
import { liveryNumber } from '@/car/liveries';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { defaultSetup } from '@/config/setup';
import { CarEntity } from '@/game/car-entity';
import type { VehicleInput } from '@/physics/types';
import type { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE } from '@/race/autopilot';
import { facingWrongWay } from '@/race/auto-recover';
import { AiDriver } from '@/race/field/ai-driver';
import { resolveCarContacts, type CarHit } from '@/race/field/car-contact';
import { buildRows, type Runner } from '@/race/field/classification';
import { clearSpot, SETTLE_S, StuckWatch } from '@/race/field/field-rules';
import { gridSlots } from '@/race/field/grid';
import { RaceOrder } from '@/race/field/race-order';
import { buildRoster, type RosterEntry } from '@/race/field/roster';
import type { KerbLayout } from '@/track/kerbs';
import type { RacingLine } from '@/track/racing-line';
import { computeSpeedProfile, type SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import type { CarModel, CreateCarModel, Livery } from '@/types/car-model';
import type { RaceHud, RaceOptions, RaceResult, RaceRow } from '@/types/race';

/** Seconds the race goes on after the player takes the flag, before the result is handed to the menus. */
export const RESULT_DELAY_S = 5;
/**
 * Only the AI cars this close to the camera (m), and at most SHADOW_CARS of them, cast shadows: each caster is drawn
 * again into every shadow cascade it touches, and a far car's shadow is a small blur nobody sees.
 */
export const SHADOW_RANGE_M = 60;
export const SHADOW_CARS = 3;
/** The HUD running order refreshes this often (s), like a broadcast tower: no re-sort and no text layout every frame. */
export const HUD_REFRESH_S = 0.25;

export interface FieldDeps {
  track: Track;
  line: RacingLine;
  kerbs: KerbLayout;
  scene: THREE.Scene;
  createModel: CreateCarModel;
}

export interface FieldPlayer { entity: CarEntity; car: CarKind; liveryIndex: number; livery: Livery }

const HOLD: VehicleInput = { throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false, hold: true };

/**
 * The AI cars of a player-vs-AI race: their entities and drivers, car contact, the running order and the
 * classification. Cars are indexed in grid order (0 = pole); the player is last, at `playerIndex`.
 */
export class OpponentField {
  readonly roster: RosterEntry[];
  readonly entities: CarEntity[];
  /** Every car's vehicle in runner order: the AI cars, then the player. */
  readonly cars: Vehicle[];
  readonly playerIndex: number;
  readonly playerSlot: { s: number; d: number };
  readonly runners: Runner[];
  order: RaceOrder;
  /** Seconds since the lights went out. */
  clock = 0;
  private readonly all: CarEntity[];
  private readonly slots: Array<{ s: number; d: number }>;
  private readonly profiles = new Map<CarKind, SpeedProfile>();
  private readonly drivers: AiDriver[] = [];
  private readonly others: Vehicle[][];
  private readonly inputs: VehicleInput[];
  private readonly watches: StuckWatch[];
  private readonly drive: Array<(input: VehicleInput) => void>;
  private readonly hits: CarHit[] = [];
  /** AI cars put back on the line so far (a count for checks). */
  recoveries = 0;
  private finishClock: number | null = null;
  private announced: number | null = null;
  private resultTaken = false;
  readonly models: readonly CarModel[];
  private readonly casting: boolean[];
  private readonly camDist: number[];
  private readonly byDist: number[];
  private hudCache: RaceHud | null = null;
  private hudAge = 0;

  constructor(private readonly d: FieldDeps, private readonly player: FieldPlayer, private readonly options: RaceOptions, seed = Math.floor(Math.random() * 1e6)) {
    this.roster = buildRoster(player, options, seed);
    const n = options.opponents;
    this.playerIndex = n;
    this.slots = gridSlots(d.track, n + 1);
    this.playerSlot = this.slots[n];
    this.entities = this.roster.map((r) => this.makeEntity(r));
    this.models = this.entities.map((e) => e.model);
    this.casting = this.entities.map(() => true);
    this.camDist = this.entities.map(() => 0);
    this.byDist = this.entities.map((_, i) => i);
    this.all = [...this.entities, player.entity];
    this.cars = this.all.map((e) => e.vehicle);
    this.others = this.cars.map((v) => this.cars.filter((o) => o !== v));
    this.inputs = this.entities.map(() => ({ throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false, hold: false }));
    this.watches = this.entities.map(() => new StuckWatch());
    this.drive = this.entities.map((_, i) => (input) => { this.drivers[i].drive(this.cars[i], this.others[i], input); });
    this.runners = [
      ...this.roster.map((r, i) => ({ id: `ai${i}`, name: r.name, number: r.number, isPlayer: false, car: r.kind })),
      { id: 'player', name: 'You', number: liveryNumber(player.livery), isPlayer: true, car: player.car },
    ];
    this.order = this.newOrder();
  }

  get playerEntity(): CarEntity { return this.player.entity; }

  private makeEntity(r: RosterEntry): CarEntity {
    const { track, kerbs, createModel, scene } = this.d;
    const e = new CarEntity(circuitCarSpec(r.kind, track.id), track, kerbs, createModel, r.livery, 'low');
    e.vehicle.handling = DEFAULT_HANDLING;
    e.vehicle.setup = defaultSetup(r.kind);
    // Wear off: each AI speed profile assumes new tyres, so a worn car would slide off over a 10-lap race.
    e.vehicle.assists = { abs: true, tc: true, autoGears: true, mechanicalDamage: false, wear: false };
    e.visualDamage = true;
    scene.add(e.model.root);
    return e;
  }

  private profileFor(r: RosterEntry): SpeedProfile {
    let p = this.profiles.get(r.kind);
    if (!p) {
      const { track, line } = this.d;
      p = computeSpeedProfile(track, line, tunedSpec(circuitCarSpec(r.kind, track.id), DEFAULT_HANDLING), { ...AI_PROFILE, gripFactor: r.gripFactor });
      this.profiles.set(r.kind, p);
    }
    return p;
  }

  private newDriver(i: number): AiDriver {
    const r = this.roster[i];
    return new AiDriver(this.d.track, this.d.line, this.profileFor(r), r.pace, r.seed);
  }

  private newOrder(): RaceOrder {
    return new RaceOrder(this.d.track.length, this.d.track.startLineS, this.options.laps, this.runners);
  }

  /** All AI cars back on their slots with fresh tyres, drivers and a fresh running order. The player is placed first. */
  placeOnGrid(): void {
    this.entities.forEach((e, i) => {
      e.vehicle.stint.reset({ compound: 'soft' });
      e.vehicle.trackGrip.reset();
      e.reset(this.slots[i].s, this.slots[i].d);
      e.repair();
      this.drivers[i] = this.newDriver(i);
      this.watches[i].reset();
    });
    this.clock = 0;
    this.finishClock = this.announced = null;
    this.resultTaken = false;
    this.order = this.newOrder();
    this.cars.forEach((v, i) => this.order.place(i, v.tp.s));
  }

  /** The player was put back on the track: the running order must not count the move. */
  placePlayer(): void { this.order.place(this.playerIndex, this.player.entity.vehicle.tp.s); }

  /**
   * One game-logic step of every AI car (held on the grid until the lights go out), then car contact and the
   * running order. Call after the player's own step. Returns this step's contacts (indices are runner indices).
   */
  step(h: number, racing: boolean): readonly CarHit[] {
    this.entities.forEach((e, i) => {
      if (racing) e.simulate(this.inputs[i], h, this.drive[i]);
      else e.simulate(HOLD, h);
    });
    const hits = resolveCarContacts(this.cars, this.hits);
    for (const hit of hits) { this.all[hit.a].recapture(); this.all[hit.b].recapture(); }
    if (!racing) return hits;
    this.clock += h;
    this.cars.forEach((v, i) => this.order.update(i, v.tp.s, this.clock));
    this.entities.forEach((e, i) => this.recover(i, e, h));
    if (this.finishClock === null && this.order.finished(this.playerIndex)) {
      this.finishClock = this.clock;
      this.announced = this.order.position(this.playerIndex);
    }
    return hits;
  }

  /** Puts a stuck AI car back on the racing line, never onto another car. */
  private recover(i: number, e: CarEntity, h: number): void {
    const v = e.vehicle, { track, line } = this.d;
    const offRoad = v.wheels.every((w) => w.surface !== 'road' && w.surface !== 'kerb');
    if (!this.watches[i].update(h, this.clock > SETTLE_S, v.speed, offRoad, facingWrongWay(track, v.tp.index, v.heading))) return;
    const s = clearSpot(track.length, v.tp.s, this.others[i].map((o) => o.tp.s));
    e.reset(s, line.offset[track.wrap(Math.round(s / track.spacing))]);
    this.order.place(i, v.tp.s);
    this.drivers[i] = this.newDriver(i);
    this.recoveries++;
  }

  /** The player's finishing position, once, in the step they took the flag; else 0. */
  takeFinish(): number {
    const p = this.announced ?? 0;
    this.announced = null;
    return p;
  }

  /** The player has been home for RESULT_DELAY_S and the result has not been taken yet. */
  get resultDue(): boolean {
    return !this.resultTaken && this.finishClock !== null && this.clock - this.finishClock >= RESULT_DELAY_S;
  }

  /** The classification now; marks the result as handed over. */
  takeResult(): RaceResult {
    this.resultTaken = true;
    return this.result();
  }

  rows(): RaceRow[] { return buildRows(this.order.standings(), this.runners, this.options.laps); }

  result(): RaceResult {
    return { circuit: this.d.track.name, laps: this.options.laps, skill: this.options.skill, rows: this.rows() };
  }

  /** The running order for the HUD, rebuilt every HUD_REFRESH_S (at once when the player's lap or finish changes). */
  hud(): RaceHud {
    const me = this.playerIndex;
    const stale = !this.hudCache || this.hudAge >= HUD_REFRESH_S || this.hudCache.finished !== this.order.finished(me)
      || this.hudCache.lap !== Math.min(this.options.laps, this.order.lapsDone(me) + 1);
    if (!stale) return this.hudCache!;
    this.hudAge = 0;
    this.hudCache = this.buildHud();
    return this.hudCache;
  }

  private buildHud(): RaceHud {
    const rows = this.rows();
    const me = rows.find((r) => r.isPlayer)!;
    return { position: me.position, total: rows.length, lap: Math.min(this.options.laps, me.lapsDone + 1), laps: this.options.laps, finished: me.finished, rows };
  }

  /** Render poses, the HUD refresh clock and shadow casting by distance from the camera. */
  sync(dt: number, camera?: THREE.Vector3): void {
    this.hudAge += dt;
    for (const e of this.entities) e.sync(dt);
    if (camera) this.updateShadows(camera);
  }

  private updateShadows(camera: THREE.Vector3): void {
    const n = this.entities.length;
    for (let i = 0; i < n; i++) {
      const v = this.entities[i].vehicle;
      this.camDist[i] = Math.hypot(v.x - camera.x, v.z - camera.z);
    }
    this.byDist.sort((a, b) => this.camDist[a] - this.camDist[b]);
    for (let k = 0; k < n; k++) {
      const i = this.byDist[k];
      const cast = k < SHADOW_CARS && this.camDist[i] < SHADOW_RANGE_M;
      if (cast === this.casting[i]) continue;
      this.casting[i] = cast;
      this.models[i].root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = cast; });
    }
  }

  /** Removes the AI models from the scene and frees them. */
  dispose(): void {
    for (const e of this.entities) {
      this.d.scene.remove(e.model.root);
      e.model.dispose();
    }
  }
}
