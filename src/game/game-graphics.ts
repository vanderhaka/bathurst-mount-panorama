import { AdaptiveQuality } from '@/game/adaptive-quality';
import { loadQualityChoice, qualityFromSettings, saveQualityChoice, type QualityChoice } from '@/game/quality-store';
import type { Stage } from '@/game/stage';
import type { CarModel } from '@/types/car-model';
import type { Settings } from '@/types/session';
import { buildWorld, disposeWorld, type World } from '@/world/world';

interface GraphicsHost {
  world: () => World;
  replaceWorld: (world: World) => void;
  models: () => Array<CarModel | null>;
  changed: (settings: Settings) => void;
  notify: (text: string) => void;
}

/** Graphics settings, observed frame budgets and rebuilding the race's visual resources. */
export class GameGraphics {
  private choice: QualityChoice;
  private readonly adaptive: AdaptiveQuality;
  private revision = 0;
  private building: Promise<void> | null = null;

  constructor(private readonly stage: Stage, private settings: Settings, private readonly host: GraphicsHost) {
    this.choice = loadQualityChoice(settings);
    this.adaptive = new AdaptiveQuality(this.choice);
  }

  startRace(): void { this.adaptive.startRace(); }

  /** After a pause: the first second of frames is not frame-rate evidence. */
  settle(): void { this.adaptive.settle(); }

  applySettings(settings: Settings): Promise<void> {
    this.settings = settings;
    const choice = qualityFromSettings(settings, this.choice);
    this.adaptive.setChoice(choice);
    return this.change(choice);
  }

  sample(rawSeconds: number, cap: Settings['frameRate']): void {
    // Frames during a rebuild say nothing about the new tier; the block itself lands in the warm-up.
    if (this.building) return;
    const choice = this.adaptive.sample(rawSeconds, cap);
    if (!choice) return;
    this.settings = { ...this.settings, quality: choice.quality, autoQuality: true };
    this.host.changed(this.settings);
    const label = choice.quality[0].toUpperCase() + choice.quality.slice(1);
    this.host.notify(choice.quality === this.choice.quality
      ? 'Resolution reduced for smoother racing. Change graphics in Settings.'
      : `Graphics set to ${label} for smoother racing. Change it in Settings.`);
    void this.change(choice);
  }

  private change(choice: QualityChoice): Promise<void> {
    const tierChanged = choice.quality !== this.choice.quality;
    const densityChanged = choice.pixelRatio !== this.choice.pixelRatio;
    this.choice = choice;
    saveQualityChoice(choice);
    if (!tierChanged && !densityChanged) return Promise.resolve();
    this.stage.setQuality(choice.quality, choice.pixelRatio);
    if (!tierChanged) return Promise.resolve();
    for (const model of this.host.models()) model?.setQuality(choice.quality);
    return this.rebuildWorld(false);
  }

  /** Serializes rebuilds; a newer tier/config request supersedes an unfinished world. */
  rebuildWorld(refreshEnvironment = true): Promise<void> {
    if (refreshEnvironment) this.stage.refreshEnvironment();
    this.revision++;
    if (this.building) return this.building;
    this.building = this.build().catch(() => {
      this.host.notify('Graphics could not finish updating. Try again in Settings.');
    }).finally(() => { this.building = null; this.adaptive.settle(); });
    return this.building;
  }

  private async build(): Promise<void> {
    let revision: number;
    do {
      revision = this.revision;
      const old = this.host.world();
      const next = await buildWorld(this.stage.renderer, () => {}, this.choice.quality, old);
      if (revision !== this.revision) { disposeWorld(next, old); continue; }
      this.stage.scene.remove(old.root);
      this.stage.scene.add(next.root);
      this.host.replaceWorld(next);
      disposeWorld(old, next);
    } while (revision !== this.revision);
  }
}
