import * as THREE from 'three';
import { RaceWakeLock } from '@/phone/wake-lock';
import { presentOnRaceTaps } from '@/phone/android-presentation';
import { createCarAudio } from '@/audio';
import { CameraRig } from '@/camera/camera-rig';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { getHandling } from '@/config/handling';
import { getSetup } from '@/config/setup';
import { LIVERY_PRESETS } from '@/car/liveries';
import { createCarModel } from '@/car/model-factory';
import { GraphicsTuner } from '@/debug/tuner';
import { Particles } from '@/fx/particles';
import { AttractMode } from '@/game/attract-mode';
import { CarEntity } from '@/game/car-entity';
import { FrameLimiter } from '@/game/frame-limiter';
import { GameGraphics } from '@/game/game-graphics';
import { loadQualityChoice } from '@/game/quality-store';
import { hudTrackInfo } from '@/game/hud-bridge';
import { RaceController } from '@/game/race-controller';
import { RaceSession } from '@/game/race-session';
import { loadSettings, saveSettings } from '@/game/settings-store';
import { Stage } from '@/game/stage';
import { installDeviceHooks } from '@/game/device-hooks';
import { sessionResults } from '@/game/session-results';
import { createHud, loadHudFonts, setHudOpacity, setHudScale } from '@/hud';
import { InputManager } from '@/input/input-manager';
import { touchOptions } from '@/input/touch-model';
import { Autopilot } from '@/race/autopilot';
import { flushRecords } from '@/race/records-queue';
import type { CarAudio } from '@/types/audio';
import type { CarModel } from '@/types/car-model';
import type { Hud, Menus } from '@/types/hud';
import type { SessionConfig, Settings } from '@/types/session';
import { createMenus } from '@/ui';
import { teleport } from '@/game/debug-tools';
import { RacingLineMesh } from '@/world/racing-line-mesh';
import { buildWorld, type World } from '@/world/world';

type GameState = 'title' | 'carSelect' | 'race' | 'paused';

export class Game {
  private state: GameState = 'title';
  /** Set when the WebGL context is lost: nothing starts, resumes or restarts a race again. */
  private halted = false;
  private readonly wakeLock = new RaceWakeLock();
  private settings: Settings = loadSettings();
  private readonly input = new InputManager();
  private readonly timer = new THREE.Timer();
  private readonly rig: CameraRig;
  private readonly lineMesh: RacingLineMesh;
  private readonly tuner: GraphicsTuner;
  private readonly attract: AttractMode;
  private race: RaceController | null = null;
  private ghostModel: CarModel | null = null;
  private audio: CarAudio | null = null;
  private fps = 60;
  private readonly focus = new THREE.Vector3();
  private readonly particles: Particles;
  private readonly graphics: GameGraphics;

  private constructor(private readonly stage: Stage, private world: World, private readonly hud: Hud, private readonly menus: Menus) {
    this.rig = new CameraRig(stage.camera, world.track);
    this.lineMesh = new RacingLineMesh(world.track, world.line, world.profile);
    stage.scene.add(this.lineMesh.mesh);
    this.particles = new Particles(stage.scene);
    this.attract = new AttractMode(stage.scene, stage.camera);
    this.graphics = new GameGraphics(stage, this.settings, {
      world: () => this.world, replaceWorld: (next) => { this.world = next; },
      models: () => [this.race?.player.model ?? null, this.ghostModel, this.attract.model],
      changed: (s) => { this.settings = s; saveSettings(s); this.menus.syncSettings(s); },
      notify: (text) => this.race?.session.say(text, 'info', 4),
    });
    this.tuner = new GraphicsTuner(() => { void this.graphics.rebuildWorld(); }, { setScale: setHudScale, setOpacity: setHudOpacity });
    this.timer.connect(document);
  }

  static async create(root: HTMLElement): Promise<Game> {
    const settings = loadSettings();
    const stage = new Stage(root, settings.quality, loadQualityChoice(settings).pixelRatio);
    const menus = createMenus();
    let game: Game | null = null;
    menus.mount(root, presentOnRaceTaps({
      onStart: (cfg) => game?.startRace(cfg),
      onResume: () => game?.resume(),
      onRestart: () => game?.restart(),
      onResetCar: () => game?.resetCar(),
      onResults: () => { if (game?.race) menus.showResults(...sessionResults(game.race.session)); },
      telemetry: () => game?.race?.session.telemetrySnapshot() ?? null,
      onToggleTuner: () => game?.tuner.toggle(),
      onQuitToMenu: () => game?.quitToTitle(),
      onSettingsChange: (s) => game?.applySettings(s),
      onPreviewCar: (car, livery) => game?.preview(car, livery),
    }), settings);
    await loadHudFonts();
    menus.showLoading(0.02, 'Starting');
    const world = await buildWorld(stage.renderer, async (f, label) => {
      menus.showLoading(f, label);
      await new Promise((r) => setTimeout(r, 0));
    }, settings.quality);
    stage.scene.add(world.root);
    const hud = createHud();
    hud.mount(root, hudTrackInfo(world.track));
    hud.setVisible(false);
    game = new Game(stage, world, hud, menus);
    installDeviceHooks(root, game.input, settings, () => { if (game?.state === 'race') game.pause(); });
    menus.showLoading(1, 'Ready');
    game.enterTitle();
    const limiter = new FrameLimiter();
    stage.renderer.setAnimationLoop((t) => { if (game && limiter.ready(t, game.settings.frameRate)) game.frame(t); });
    return game;
  }

  private makeEntity(car: CarKind, liveryIndex: number): CarEntity {
    const livery = LIVERY_PRESETS[car][liveryIndex % LIVERY_PRESETS[car].length].livery;
    const e = new CarEntity(CAR_SPECS[car], this.world.track, this.world.kerbs, (kind, options) => createCarModel(kind, { ...options, quality: this.settings.quality }), livery);
    e.vehicle.handling = getHandling(); // a race car takes the live values every frame
    e.vehicle.setup = getSetup(car);
    this.stage.scene.add(e.model.root);
    return e;
  }

  /** Title screen: an AI car laps the mountain behind the menu (attract mode). */
  private enterTitle(): void {
    this.state = 'title';
    this.hud.setVisible(false);
    this.attract.drop();
    const entity = this.makeEntity('camaro', 0);
    const s = 900;
    entity.reset(s, this.world.line.offset[Math.round(s / this.world.track.spacing)]);
    this.attract.set(entity, this.world.line);
    this.rig.mode = 'tv';
    this.menus.showTitle();
  }

  private preview(car: CarKind, liveryIndex: number): void {
    this.state = 'carSelect';
    this.attract.drop();
    const entity = this.makeEntity(car, liveryIndex);
    entity.reset(this.world.track.gridLineS - 7, -2.2);
    this.attract.set(entity, this.world.line);
  }

  private startRace(cfg: SessionConfig): void {
    if (this.halted) return;
    this.applySettings(cfg.settings);
    this.attract.drop();
    this.endRace();
    const player = this.makeEntity(cfg.car, cfg.liveryIndex);
    const session = new RaceSession(cfg.car, this.world.track, this.world.line, player, cfg.tyres ?? 'soft');
    session.placeOnGrid();
    this.ghostModel = createCarModel(cfg.car, { livery: LIVERY_PRESETS[cfg.car][0].livery, detail: 'low', quality: this.settings.quality });
    this.ghostModel.setGhost(true);
    this.ghostModel.root.visible = false;
    this.stage.scene.add(this.ghostModel.root);
    this.audio = createCarAudio(cfg.car);
    void this.audio.start().then(() => this.audio?.setMasterVolume(this.settings.masterVolume)).catch(() => {});
    this.race = new RaceController(session, player, {
      input: this.input, rig: this.rig, hud: this.hud, lineMesh: this.lineMesh,
      audio: this.audio, ghostModel: this.ghostModel, settings: () => this.settings, particles: this.particles, startLights: (n) => this.world.setStartLights(n), stage: this.stage,
    });
    this.rig.mode = this.settings.camera;
    this.rig.snap();
    this.hud.setVisible(true);
    this.state = 'race';
    this.graphics.startRace();
  }

  private endRace(): void {
    if (this.race) {
      this.stage.scene.remove(this.race.player.model.root);
      this.race.player.model.dispose();
      this.race = null;
    }
    if (this.ghostModel) {
      this.stage.scene.remove(this.ghostModel.root);
      this.ghostModel.dispose();
      this.ghostModel = null;
    }
    this.audio?.dispose();
    this.audio = null;
    this.lineMesh.mesh.visible = false;
  }

  private pause(): void {
    this.state = 'paused';
    this.audio?.suspend();
    this.menus.showPause();
  }

  /** The WebGL context is lost and main.ts offers a reload: pause for good, releasing wake lock and audio. */
  halt(): void { this.halted = true; this.wakeLock.setRunning(false); if (this.state === 'race') this.pause(); }

  private resume(): void {
    if (this.state !== 'paused' || this.halted) return;
    this.state = 'race';
    this.audio?.resume();
    this.graphics.settle();
  }

  private restart(): void {
    if (!this.race || this.halted) return;
    this.race.session.placeOnGrid();
    this.race.profiles.reset();
    this.rig.snap();
    this.state = 'race';
    this.audio?.resume();
    this.graphics.startRace();
  }

  /** Pause menu: back on the racing line here, repaired (the lap becomes invalid). */
  private resetCar(): void {
    this.race?.session.resetToTrack();
    this.rig.snap();
    this.resume();
  }

  private quitToTitle(): void {
    flushRecords();
    this.endRace();
    this.enterTitle();
  }

  private applySettings(s: Settings): void {
    this.settings = { ...s };
    this.input.configureTouch(touchOptions(s));
    void this.graphics.applySettings(this.settings);
    saveSettings(this.settings);
    this.audio?.setMasterVolume(s.masterVolume);
  }

  private frame(time: number): void {
    this.wakeLock.setRunning(this.state === 'race' && !this.menus.isOpen() && Boolean(this.race?.session.racing));
    this.timer.update(time);
    const rawDt = this.timer.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    if (this.state === 'race') this.graphics.sample(rawDt, this.settings.frameRate);
    this.fps += (1 / Math.max(rawDt, 1e-3) - this.fps) * 0.05;
    this.input.menusOpen = this.menus.isOpen();
    this.menus.setPadStyle(this.input.padStyle);
    let nav = this.input.takeMenuNav();
    while (nav) { this.menus.nav(nav); nav = this.input.takeMenuNav(); }
    if (this.input.consume('tuner')) this.tuner.toggle();
    if (this.state === 'race' && this.race) this.raceFrame(dt);
    else if (this.state !== 'paused') this.demoFrame(dt);
    else {
      this.input.update(dt);
      // Options / Menu toggles the pause, like a console game.
      if (this.input.consume('pause')) { this.menus.hide(); this.resume(); }
    }
    this.world.scenery.update(this.stage.camera.position);
    this.particles.update(this.state === 'paused' ? 0 : dt);
    this.stage.render(this.focus, this.state === 'race' ? this.race?.player.vehicle.speed ?? 0 : 0, this.settings.motionBlur);
  }

  private raceFrame(dt: number): void {
    const race = this.race!;
    const input = this.input;
    if (input.consume('pause')) return this.pause();
    const before = JSON.stringify(this.settings);
    if (input.consume('camera')) this.settings.camera = this.rig.cycle();
    if (input.consume('reset')) race.session.resetToTrack();
    if (input.consume('ghost')) this.settings.ghost = !this.settings.ghost;
    if (input.consume('hud')) this.hudHidden = !this.hudHidden;
    const lines: Settings['racingLine'][] = ['off', 'braking', 'full'];
    if (input.consume('racingLine')) this.settings.racingLine = lines[(lines.indexOf(this.settings.racingLine) + 1) % 3];
    // In-race toggles persist and the menus show (and start the next race with) the same values.
    if (JSON.stringify(this.settings) !== before) { saveSettings(this.settings); this.menus.syncSettings(this.settings); }
    this.hud.setVisible(!this.hudHidden);
    this.rig.lookBack = input.isHeld('lookBack');
    race.frame(dt * this.timeScale, this.settings.showFps ? this.fps : null);
    this.followCamera(race.player, dt);
  }
  private hudHidden = false;

  /** Verification hooks (used by scripts/capture-evidence.mjs). */
  timeScale = 1;
  setDebugAutopilot(on: boolean): void {
    if (this.race) this.race.autopilot = on ? new Autopilot(this.world.track, this.world.line, this.race.profiles.ai) : null;
  }
  /** Places the player at distance s on the racing line, at the AI target speed, and skips the start lights. */
  debugTeleport(s: number): void {
    if (!this.race) return;
    teleport(this.race, this.world, this.race.profiles.ai, s);
    this.rig.snap();
  }

  private demoFrame(dt: number): void {
    this.input.update(dt);
    this.attract.frame(dt, this.state === 'title', (e, h) => this.followCamera(e, h), this.focus);
  }

  private followCamera(entity: CarEntity, dt: number): void {
    if (this.stage.camera.view) this.stage.camera.clearViewOffset();
    const v = entity.vehicle;
    const m = entity.model;
    this.rig.update({ position: m.root.position, quaternion: m.root.quaternion, heading: v.heading, speed: v.speed, cockpit: m.cockpitCamera, bonnet: m.bonnetCamera, s: v.tp.s, gLong: v.telemetry.gLong, gLat: v.telemetry.gLat, headMotion: this.settings.headMotion }, dt);
    m.setInteriorVisible(this.rig.mode === 'cockpit' || this.rig.mode === 'bonnet');
    this.focus.copy(m.root.position);
  }
}
