import * as THREE from 'three';
import { tyreScrubUse } from '@/audio/dsp/tyre-scrub';
import { cockpitHeaveScale, type CameraRig } from '@/camera/camera-rig';
import { DEFAULT_HANDLING, getHandling } from '@/config/handling';
import { defaultSetup } from '@/config/setup';
import type { Particles } from '@/fx/particles';
import type { CarEntity } from '@/game/car-entity';
import { buildHudState } from '@/game/hud-bridge';
import { mirrorView } from '@/game/mirror-view';
import type { RaceEffects } from '@/game/race-effects';
import type { RaceSession } from '@/game/race-session';
import { trackLapsDriven, trackRaceStart } from '@/game/usage-analytics';
import { PhoneVibration } from '@/input/phone-vibration';
import type { InputManager } from '@/input/input-manager';
import { TOUCH_STEER_SCALE } from '@/input/touch-model';
import { impactSeverity } from '@/physics/damage';
import type { VehicleInput } from '@/physics/types';
import { applyAssists } from '@/race/assists';
import { AutoRecover, facingWrongWay } from '@/race/auto-recover';
import { updateRaceSetup } from '@/race/setup-controls';
import type { Autopilot } from '@/race/autopilot';
import { SessionProfiles } from '@/game/session-profiles';
import type { CarAudio, Surface } from '@/types/audio';
import type { CarModel } from '@/types/car-model';
import type { Hud, HudState } from '@/types/hud';
import type { Settings } from '@/types/session';
import type { RacingLineMesh } from '@/world/racing-line-mesh';

/** Distance (m) inside which the ghost is hidden in the cockpit and bonnet views. */
const GHOST_HIDE_IN_CAR = 14;

const SURFACE_RANK: Record<string, number> = { road: 0, asphalt: 0, concrete: 0, kerb: 1, grass: 2, gravel: 3 };

export interface RaceDeps {
  input: InputManager;
  rig: CameraRig;
  hud: Hud;
  lineMesh: RacingLineMesh;
  audio: CarAudio | null;
  ghostModel: CarModel | null;
  particles: Particles;
  /** Car effects (smoke, dust, flames, sparks) and the rubber marbles for the current world. */
  effects: RaceEffects;
  /** Live settings (read every frame so that menu changes apply at once). */
  settings: () => Settings;
  /** Shows the session's start-light count on the grid gantry. */
  startLights: (n: number) => void;
  /** Renderer and scene (for the live rear-view mirror). */
  stage: { renderer: THREE.WebGLRenderer; scene: THREE.Scene };
}

/** One frame of driving: controls -> assists -> physics -> race logic -> feedback (HUD, audio, rumble, camera). */
export class RaceController {
  readonly profiles: SessionProfiles;
  private readonly vin: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  private hudState: HudState | null = null;
  private readonly phoneVibration = new PhoneVibration();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  /** Verification hook: when set, this driver replaces the player's controls. */
  autopilot: Autopilot | null = null;
  private stuckT = 0;
  /** Casual: puts a stuck car back on the track (Settings.autoRecover). */
  private readonly recover = new AutoRecover();
  private damageMode: Settings['damage'] | null = null;

  constructor(readonly session: RaceSession, readonly player: CarEntity, private readonly d: RaceDeps) {
    this.profiles = new SessionProfiles(player.vehicle, session.line);
    d.lineMesh.setProfile(this.profiles.player);
    // One RaceController per race started from the menu (Restart reuses it, so it is not counted again).
    trackRaceStart(session.track.id, session.car);
    d.effects.resetAll();
  }

  frame(dt: number, fps: number | null): void {
    const { input } = this.d;
    const settings = this.d.settings();
    this.session.setRules(settings);
    this.phoneVibration.setEnabled(settings.phoneVibration);
    const v = this.player.vehicle;
    const sens = input.steerSensitivity;
    sens.keyboard = settings.steerKeyboard;
    sens.pad = settings.steerPad;
    sens.touch = settings.steerTouch * TOUCH_STEER_SCALE;
    const controls = input.update(dt);
    v.assists = { abs: settings.abs, tc: settings.tractionControl, autoGears: settings.autoGears, mechanicalDamage: settings.damage === 'full', wear: settings.wear };
    this.player.visualDamage = settings.damage !== 'off';
    if (settings.damage !== this.damageMode) {
      // A change in the race removes the damage that the new mode does not keep.
      if (settings.damage === 'off') this.player.repair();
      else if (settings.damage === 'visual') v.repair();
      this.damageMode = settings.damage;
    }
    const competition = this.session.mode !== 'timeTrial';
    v.handling = competition ? DEFAULT_HANDLING : getHandling();
    v.setup = competition ? defaultSetup(this.session.car) : updateRaceSetup(this.session.car, input, (text) => this.session.say(text, 'info', 2));
    if (this.autopilot) this.session.invalidateShootout('Verification driving cannot enter the competition.');
    const shiftUp = input.consume('shiftUp');
    const shiftDown = input.consume('shiftDown');
    // Game logic runs in steps of at most 1/60 s of game time (time-scaled runs stay stable).
    const steps = Math.max(1, Math.ceil(dt / (1 / 60) - 1e-6));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) {
      if (this.session.waitingForShootout) break;
      if (this.autopilot) this.autopilot.drive(v, this.vin);
      else applyAssists(controls, v, { steeringAssist: settings.steeringAssist }, this.vin);
      this.vin.shiftUp = k === 0 && shiftUp;
      this.vin.shiftDown = k === 0 && shiftDown;
      this.session.updateLights(h);
      this.vin.hold = !this.session.racing;
      if (this.vin.hold) {
        // On the grid: brakes held, the engine can be revved.
        this.vin.brake = 1;
        this.vin.steer = 0;
      }
      const pilot = this.autopilot;
      const impacts = this.player.simulate(this.vin, h, pilot && this.session.racing ? (vin) => { this.profiles.update(); pilot.drive(v, vin); } : undefined);
      this.profiles.update();
      for (const imp of impacts) {
        this.phoneVibration.impact(imp.speed);
        const sev = impactSeverity(imp.speed);
        for (let q = 0; q < 6 + sev * 40; q++) this.d.particles.emit('spark', imp.x, imp.y, imp.z, v.vx * 0.6, 0, v.vz * 0.6);
        this.d.rig.addShake(0.25 + sev);
        this.d.audio?.impact(Math.min(1, 0.15 + sev));
        input.rumble(0.4 + sev, 0.6, 120 + sev * 300);
        if (sev > 0.35) this.session.say(settings.damage === 'full' ? 'HEAVY IMPACT — DAMAGE' : 'HEAVY IMPACT', 'warn');
      }
      const lap = this.session.update(h);
      // The verification autopilot never counts.
      if (lap && !this.autopilot) trackLapsDriven(this.session.track.id, this.session.car, this.session.sessionLaps.length);
      if (this.session.waitingForShootout) break;
      if (settings.autoRecover && !this.autopilot && this.session.racing) {
        const offTrack = v.wheels.every((w) => w.surface !== 'road' && w.surface !== 'kerb');
        const wrongWay = facingWrongWay(this.session.track, v.tp.index, v.heading);
        if (this.recover.update(h, { speed: v.speed, offTrack, wrongWay, throttle: this.vin.throttle })) this.resetToTrack('auto');
      } else this.recover.reset();
      // The verification driver never gives up: reset when stuck.
      if (this.autopilot && this.session.racing) {
        this.stuckT = Math.abs(v.speed) < 2 ? this.stuckT + h : 0;
        if (this.stuckT > 2.5) { this.resetToTrack(); this.stuckT = 0; }
      }
    }
    this.player.sync(dt, cockpitHeaveScale(this.d.rig.mode, settings.headMotion));
    this.d.startLights(this.session.lights);
    mirrorView().update(this.d.stage.renderer, this.d.stage.scene, this.player.model, this.d.rig.mode === 'cockpit' && !this.d.rig.lookBack);
    this.d.effects.step(this.player, dt);
    this.updateGhost();
    this.feedback(dt);
    this.d.lineMesh.mode = settings.racingLine;
    this.d.lineMesh.update(v.tp.s, Math.abs(v.speed));
    this.hudState = buildHudState(this.session, this.profiles.player, settings, fps, this.hudState);
    this.hudState.view = this.d.rig.mode === 'cockpit' && !this.d.rig.lookBack ? 'cockpit' : 'outside';
    this.d.hud.update(this.hudState);
    if (this.d.rig.mode === 'cockpit' || this.d.rig.mode === 'bonnet') {
      const e = v.spec.engine;
      const hs = this.hudState;
      this.player.model.setDash?.({
        gear: v.pt.gear, speedKmh: hs.speedKmh,
        shiftLights: Math.max(0, (v.pt.rpm - (e.redlineRpm - 1700)) / 1600), rpm: v.pt.rpm,
        lapS: hs.lap.number > 0 ? hs.lap.currentS : null, deltaS: hs.lap.deltaS,
        waterTempC: 88 + Math.min(14, this.session.timer.lapTime / 20),
      });
    }
  }

  /** Puts the car back on the racing line (repaired) and clears the effects' burst state. */
  resetToTrack(reason: 'manual' | 'auto' = 'manual'): void {
    this.session.resetToTrack(reason);
    this.d.effects.resetCar();
  }

  /** Back to the grid: the lap profiles and every effect start clean. */
  restart(): void {
    this.profiles.reset();
    this.d.effects.resetAll();
  }

  private updateGhost(): void {
    const g = this.d.ghostModel;
    if (!g) return;
    const p = this.session.ghostPose;
    // From the in-car views a ghost within a few car lengths would fill the windscreen: hide it.
    const inCar = this.d.rig.mode === 'cockpit' || this.d.rig.mode === 'bonnet';
    const v = this.player.vehicle;
    const close = Math.hypot(p.x - v.x, p.z - v.z) < GHOST_HIDE_IN_CAR;
    const show = this.d.settings().ghost && this.session.ghostVisible && !(inCar && close);
    g.root.visible = show;
    if (!show) return;
    const spec = this.player.vehicle.spec;
    this.e.set(-p.pitch, p.heading, p.roll, 'YXZ');
    g.root.quaternion.setFromEuler(this.e);
    const mid = spec.dimensions.wheelbase * (0.5 - spec.frontWeight);
    g.root.position.set(p.x, p.y - spec.cgHeight, p.z).add(new THREE.Vector3(0, 0, mid).applyQuaternion(g.root.quaternion));
    for (let i = 0; i < 4; i++) g.setWheel(i as 0 | 1 | 2 | 3, (this.session.timer.lapTime * p.speed) / spec.dimensions.wheelRadius, i < 2 ? p.steer : 0, 0);
  }

  private feedback(dt: number): void {
    const v = this.player.vehicle;
    const t = v.telemetry;
    let worst: Surface = 'asphalt';
    let maxSlip = 0;
    for (const w of v.wheels) {
      const s = (w.surface === 'road' || w.surface === 'concrete' ? 'asphalt' : w.surface) as Surface;
      if (SURFACE_RANK[s] > SURFACE_RANK[worst]) worst = s;
      maxSlip = Math.max(maxSlip, w.slip);
    }
    const speed = Math.abs(v.speed);
    this.phoneVibration.kerb(v.wheels, speed);
    if (worst === 'kerb' && speed > 8) {
      this.d.rig.addShake(0.18);
      this.d.input.rumble(0.15, 0.35, 60);
    } else if ((worst === 'grass' || worst === 'gravel') && speed > 5) {
      this.d.rig.addShake(worst === 'gravel' ? 0.35 : 0.2);
    }
    const mode = this.d.rig.mode;
    this.d.audio?.update({
      rpm: t.rpm,
      load: t.load,
      throttle: t.throttle,
      speedKmh: speed * 3.6,
      gear: t.gear,
      onLimiter: t.onLimiter,
      slip: Math.max(0, Math.min(1, (maxSlip - 0.9) / 0.6)) * Math.min(1, speed / 10),
      scrub: tyreScrubUse(v.wheels),
      surface: worst,
      interior: mode === 'cockpit' ? 1 : mode === 'bonnet' ? 0.55 : 0,
      shifted: t.shifted,
    }, dt);
    t.shifted = false;
  }
}
