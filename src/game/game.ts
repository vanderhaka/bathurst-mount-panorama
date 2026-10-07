import * as THREE from 'three';
import { createCarAudio } from '@/audio';
import { CameraRig } from '@/camera/camera-rig';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { getHandling } from '@/config/handling';
import { LIVERY_PRESETS } from '@/car/liveries';
import { createCarModel } from '@/car/model-factory';
import { GraphicsTuner } from '@/debug/tuner';
import { Particles } from '@/fx/particles';
import { CarEntity } from '@/game/car-entity';
import { hudTrackInfo } from '@/game/hud-bridge';
import { ProfileCache } from '@/game/profile-cache';
import { RaceController } from '@/game/race-controller';
import { RaceSession } from '@/game/race-session';
import { loadSettings, saveSettings } from '@/game/settings-store';
import { Stage } from '@/game/stage';
import { createHud, loadHudFonts, setHudOpacity, setHudScale } from '@/hud';
import { InputManager } from '@/input/input-manager';
import { Autopilot } from '@/race/autopilot';
import type { CarAudio } from '@/types/audio';
import type { CarModel } from '@/types/car-model';
import type { Hud, Menus } from '@/types/hud';
import type { SessionConfig, Settings } from '@/types/session';
import { createMenus } from '@/ui';
import { orbitCamera, teleport } from '@/game/debug-tools';
import { RacingLineMesh } from '@/world/racing-line-mesh';
import { buildWorld, disposeWorld, type World } from '@/world/world';

type GameState = 'title' | 'carSelect' | 'race' | 'paused';

export class Game {
  private state: GameState = 'title';
  private settings: Settings = loadSettings();
  private readonly input = new InputManager();
  private readonly timer = new THREE.Timer();
  private readonly rig: CameraRig;
  private readonly lineMesh: RacingLineMesh;
  private readonly tuner: GraphicsTuner;
  private readonly profiles = new ProfileCache(() => this.world);
  private demo: { entity: CarEntity; pilot: Autopilot } | null = null;
  private race: RaceController | null = null;
  private ghostModel: CarModel | null = null;
  private audio: CarAudio | null = null;
  private fps = 60;
  private readonly focus = new THREE.Vector3();
  private readonly particles: Particles;

  private constructor(private readonly stage: Stage, private world: World, private readonly hud: Hud, private readonly menus: Menus) {
    this.rig = new CameraRig(stage.camera, world.track);
    this.lineMesh = new RacingLineMesh(world.track, world.line, world.profile);
    stage.scene.add(this.lineMesh.mesh);
    this.particles = new Particles(stage.scene);
    this.tuner = new GraphicsTuner(() => this.rebuildWorld(), { setScale: setHudScale, setOpacity: setHudOpacity });
    this.timer.connect(document);
  }

  static async create(root: HTMLElement): Promise<Game> {
    const settings = loadSettings();
    const stage = new Stage(root, settings.quality);
    const menus = createMenus();
    let game: Game | null = null;
    menus.mount(root, {
      onStart: (cfg) => game?.startRace(cfg),
      onResume: () => game?.resume(),
      onRestart: () => game?.restart(),
      onResetCar: () => game?.resetCar(),
      onQuitToMenu: () => game?.quitToTitle(),
      onSettingsChange: (s) => game?.applySettings(s),
      onPreviewCar: (car, livery) => game?.preview(car, livery),
    }, settings);
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
    menus.showLoading(1, 'Ready');
    game.enterTitle();
    stage.renderer.setAnimationLoop((t) => game?.frame(t));
    return game;
  }

  private makeEntity(car: CarKind, liveryIndex: number): CarEntity {
    const livery = LIVERY_PRESETS[car][liveryIndex % LIVERY_PRESETS[car].length].livery;
    const e = new CarEntity(CAR_SPECS[car], this.world.track, this.world.kerbs, createCarModel, livery);
    e.vehicle.handling = getHandling(); // a race car takes the live values every frame
    this.stage.scene.add(e.model.root);
    return e;
  }

  private dropDemo(): void {
    if (!this.demo) return;
    this.stage.scene.remove(this.demo.entity.model.root);
    this.demo.entity.model.dispose();
    this.demo = null;
  }

  /** Title screen: an AI car laps the mountain behind the menu (attract mode). */
  private enterTitle(): void {
    this.state = 'title';
    this.hud.setVisible(false);
    this.dropDemo();
    const entity = this.makeEntity('camaro', 0);
    const s = 900;
    entity.reset(s, this.world.line.offset[Math.round(s / this.world.track.spacing)]);
    this.demo = { entity, pilot: new Autopilot(this.world.track, this.world.line, this.profiles.get('camaro').ai) };
    this.rig.mode = 'tv';
    this.menus.showTitle();
  }

  private preview(car: CarKind, liveryIndex: number): void {
    this.state = 'carSelect';
    this.dropDemo();
    const entity = this.makeEntity(car, liveryIndex);
    entity.reset(this.world.track.gridLineS - 7, -2.2);
    this.demo = { entity, pilot: new Autopilot(this.world.track, this.world.line, this.profiles.get(car).ai) };
  }

  private startRace(cfg: SessionConfig): void {
    this.applySettings(cfg.settings);
    this.dropDemo();
    this.endRace();
    const player = this.makeEntity(cfg.car, cfg.liveryIndex);
    const session = new RaceSession(cfg.car, this.world.track, this.world.line, player);
    session.placeOnGrid();
    this.ghostModel = createCarModel(cfg.car, { livery: LIVERY_PRESETS[cfg.car][0].livery, detail: 'low' });
    this.ghostModel.setGhost(true);
    this.ghostModel.root.visible = false;
    this.stage.scene.add(this.ghostModel.root);
    this.audio = createCarAudio(cfg.car);
    void this.audio.start().then(() => this.audio?.setMasterVolume(this.settings.masterVolume)).catch(() => {});
    this.race = new RaceController(session, player, {
      input: this.input, rig: this.rig, hud: this.hud, lineMesh: this.lineMesh, profile: this.profiles.get(cfg.car).player,
      audio: this.audio, ghostModel: this.ghostModel, settings: () => this.settings, particles: this.particles, startLights: (n) => this.world.setStartLights(n), stage: this.stage,
    });
    this.rig.mode = this.settings.camera;
    this.rig.snap();
    this.hud.setVisible(true);
    this.state = 'race';
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

  private resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'race';
    this.audio?.resume();
  }

  private restart(): void {
    if (!this.race) return;
    this.race.session.placeOnGrid();
    this.rig.snap();
    this.state = 'race';
    this.audio?.resume();
  }

  /** Pause menu: back on the racing line here, repaired (the lap becomes invalid). */
  private resetCar(): void {
    if (!this.race) return;
    this.race.session.resetToTrack();
    this.rig.snap();
    this.resume();
  }

  private quitToTitle(): void {
    this.endRace();
    this.enterTitle();
  }

  private applySettings(s: Settings): void {
    const qualityChanged = s.quality !== this.settings.quality;
    this.settings = { ...s };
    saveSettings(this.settings);
    this.audio?.setMasterVolume(s.masterVolume);
    if (qualityChanged) this.stage.setQuality(s.quality);
  }

  /** Rebuilds terrain, road and scenery with the current graphics config (track model kept). */
  private rebuilding = false;
  private rebuildWorld(): void {
    if (this.rebuilding) return;
    this.rebuilding = true;
    this.stage.refreshEnvironment();
    const old = this.world;
    void buildWorld(this.stage.renderer, () => {}, this.settings.quality, old).then((next) => {
      this.stage.scene.remove(old.root);
      disposeWorld(old);
      this.stage.scene.add(next.root);
      this.world = next;
      this.rebuilding = false;
    });
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    this.input.menusOpen = this.menus.isOpen();
    this.menus.setPadStyle(this.input.padStyle);
    let nav = this.input.takeMenuNav();
    while (nav) { this.menus.nav(nav); nav = this.input.takeMenuNav(); }
    if (this.input.consume('tuner')) this.tuner.toggle();
    if (this.state === 'race' && this.race) this.raceFrame(dt);
    else if (this.state !== 'paused') this.demoFrame(dt);
    else this.input.update(dt);
    this.world.scenery.update(this.stage.camera.position);
    this.particles.update(this.state === 'paused' ? 0 : dt);
    this.stage.render(this.focus);
  }

  private raceFrame(dt: number): void {
    const race = this.race!;
    const input = this.input;
    if (input.consume('pause')) {
      this.state = 'paused';
      this.audio?.suspend();
      this.menus.showPause();
      return;
    }
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
    if (!this.race) return;
    const car = this.race.session.car;
    this.race.autopilot = on ? new Autopilot(this.world.track, this.world.line, this.profiles.get(car).ai) : null;
  }
  /** Places the player at distance s on the racing line, at the AI target speed, and skips the start lights. */
  debugTeleport(s: number): void {
    if (!this.race) return;
    teleport(this.race, this.world, this.profiles.get(this.race.session.car).ai, s);
    this.rig.snap();
  }

  private demoFrame(dt: number): void {
    this.input.update(dt);
    if (!this.demo) return;
    const { entity, pilot } = this.demo;
    if (this.state === 'title') {
      const vin = pilot.drive(entity.vehicle, { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false });
      entity.simulate(vin, dt);
      entity.sync(dt);
      this.followCamera(entity, dt);
    } else {
      entity.sync(dt);
      this.orbitPreview(entity, dt);
    }
  }

  private orbitAngle = 0.9;
  private orbitPreview(entity: CarEntity, dt: number): void {
    this.orbitAngle += dt * 0.16;
    orbitCamera(this.stage.camera, entity.model.root.position, this.orbitAngle);
    this.focus.copy(entity.model.root.position);
  }

  private followCamera(entity: CarEntity, dt: number): void {
    if (this.stage.camera.view) this.stage.camera.clearViewOffset();
    const v = entity.vehicle;
    const m = entity.model;
    this.rig.update({ position: m.root.position, quaternion: m.root.quaternion, heading: v.heading, speed: v.speed, cockpit: m.cockpitCamera, bonnet: m.bonnetCamera, s: v.tp.s }, dt);
    m.setInteriorVisible(this.rig.mode === 'cockpit' || this.rig.mode === 'bonnet');
    this.focus.copy(m.root.position);
  }
}
