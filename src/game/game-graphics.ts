import { AdaptiveQuality, frameBudget } from '@/game/adaptive-quality';
import { DynamicResolution } from '@/render/dynamic-resolution';
import { loadQualityChoice, qualityFromSettings, saveQualityChoice, type QualityChoice } from '@/game/quality-store';
import type { Stage } from '@/game/stage';
import type { CarModel } from '@/types/car-model';
import type { Settings } from '@/types/session';
import { buildWorld, disposeWorld, type World } from '@/world/world';

interface GraphicsHost {
  world: () => World;
  /** Puts a freshly built world to use (effects, reflection probes); may yield between probes. */
  replaceWorld: (world: World, pause: (done: number, total: number) => Promise<void>) => Promise<void>;
  models: () => Array<CarModel | null>;
  changed: (settings: Settings) => void;
  notify: (text: string) => void;
  /** Loading screen with progress while the visuals are rebuilt; `end` returns to the screen that was open. */
  progress: (fraction: number, label: string) => void;
  endProgress: () => void;
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
/** Resolves once the browser has had a chance to paint (or after 100 ms where it does not, e.g. a hidden tab). */
function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return yieldToEventLoop();
  return Promise.race([
    new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))),
    new Promise<void>((resolve) => setTimeout(resolve, 100)),
  ]);
}
const tierName = (quality: QualityChoice['quality']): string => quality[0].toUpperCase() + quality.slice(1);

/** Graphics settings, observed frame budgets and rebuilding the race's visual resources.
 * The tier and the pixel density never change during a race: an automatic verdict waits as `pending` and is
 * applied at the next race boundary (applyPending), behind the loading screen. */
export class GameGraphics {
  private choice: QualityChoice;
  private pending: QualityChoice | null = null;
  private readonly adaptive: AdaptiveQuality;
  /** Small, continuous deficits: the scene target's scale. Tier steps (adaptive) take the large ones. */
  private readonly resolution = new DynamicResolution();
  private revision = 0;
  /** The newest change request; an older one that is still waiting for the loading screen to paint stands down. */
  private changeId = 0;
  private building: Promise<void> | null = null;
  /** Loading-screen text for the rebuild in flight; null (the graphics tuner) shows no loading screen. */
  private label: string | null = null;

  constructor(private readonly stage: Stage, private settings: Settings, private readonly host: GraphicsHost) {
    this.choice = loadQualityChoice(settings);
    this.adaptive = new AdaptiveQuality(this.choice);
  }

  startRace(): void { this.adaptive.startRace(); this.resolution.hold(); }

  /** After a pause: the first second of frames is not frame-rate evidence. */
  settle(): void { this.adaptive.settle(); this.resolution.hold(); }

  /** Menus and the title screen are never measured, so they render at the full scale. */
  endRace(): void { this.resetResolution(); }

  hasPending(): boolean { return this.pending !== null; }

  /** True while the loading screen covers a rebuild: drawing the scene underneath would only compile shaders for the old world. */
  get covered(): boolean { return this.label !== null; }

  /** The player chose graphics themselves: that beats any queued automatic step. */
  applySettings(settings: Settings): Promise<void> {
    this.settings = settings;
    this.pending = null;
    const choice = qualityFromSettings(settings, this.choice);
    this.adaptive.setChoice(choice);
    return this.change(choice, `Applying ${tierName(choice.quality)} graphics`);
  }

  /** Applies the queued automatic step (null when none is waiting). Call only at a race boundary. */
  async applyPending(): Promise<QualityChoice | null> {
    const choice = this.pending;
    if (!choice) return null;
    this.pending = null;
    this.settings = { ...this.settings, quality: choice.quality, autoQuality: true };
    this.host.changed(this.settings);
    this.adaptive.setChoice(choice);
    await this.change(choice, choice.quality === this.choice.quality
      ? 'Lowering the resolution for smoother racing'
      : `Switching to ${tierName(choice.quality)} graphics for smoother racing`);
    return choice;
  }

  sample(rawSeconds: number, cap: Settings['frameRate']): void {
    // Frames during a rebuild say nothing about the new tier; the block itself lands in the warm-up.
    // One queued step per race: more evidence at the unchanged tier would only repeat it.
    if (this.building) return;
    // Manual tiers keep their full pixel density, like their tier; Low without a post chain has no scene target.
    let exhausted = true;
    if (this.choice.automatic && this.stage.scalable) {
      const scale = this.resolution.sample(rawSeconds, this.stage.takeGpuSeconds(), frameBudget(this.choice.quality, cap));
      if (scale !== null) this.stage.setRenderScale(scale);
      exhausted = this.resolution.exhausted;
    }
    if (this.pending) return;
    this.queue(this.adaptive.sample(rawSeconds, cap, exhausted));
  }

  /** Verification hook: queues the step a sustained over-budget race would reach. */
  debugForceStep(): QualityChoice | null {
    const step = this.adaptive.debugStep();
    this.queue(step);
    return step;
  }

  /** The latest verdict replaces an older one that was not applied yet. */
  private queue(choice: QualityChoice | null): void {
    if (choice) this.pending = choice;
  }

  private async change(choice: QualityChoice, label: string): Promise<void> {
    const tierChanged = choice.quality !== this.choice.quality;
    const densityChanged = choice.pixelRatio !== this.choice.pixelRatio;
    this.choice = choice;
    saveQualityChoice(choice);
    if (tierChanged || densityChanged || !choice.automatic) this.resetResolution();
    if (!tierChanged && !densityChanged) return;
    const id = ++this.changeId;
    if (tierChanged) {
      // The loading screen must be on screen before the heavy synchronous work below starts.
      this.label = label;
      this.host.progress(0.01, label);
      await nextPaint();
      if (id !== this.changeId) return; // a newer request carries the work on
    }
    try {
      this.stage.setQuality(choice.quality, choice.pixelRatio);
      if (!tierChanged) return;
      for (const model of this.host.models()) model?.setQuality(choice.quality);
    } catch (error) {
      this.label = null;
      this.host.endProgress();
      throw error;
    }
    await this.rebuildWorld(false);
  }

  private resetResolution(): void {
    if (this.resolution.reset()) this.stage.setRenderScale(1);
  }

  /** Serializes rebuilds; a newer tier/config request supersedes an unfinished world. */
  rebuildWorld(refreshEnvironment = true): Promise<void> {
    if (refreshEnvironment) this.stage.refreshEnvironment();
    this.revision++;
    if (this.building) return this.building;
    this.building = this.build().catch(() => {
      this.host.notify('Graphics could not finish updating. Try again in Settings.');
    }).finally(() => {
      if (this.label) this.host.endProgress();
      this.label = null;
      this.building = null;
      this.adaptive.settle();
      this.resolution.hold();
    });
    return this.building;
  }

  /** Every step reports to the loading screen (when one is wanted) and hands the thread back to the browser. */
  private async step(fraction: number): Promise<void> {
    if (this.label) this.host.progress(fraction, this.label);
    await yieldToEventLoop();
  }

  private async build(): Promise<void> {
    let revision: number;
    do {
      revision = this.revision;
      const old = this.host.world();
      await this.step(0.02);
      const next = await buildWorld(this.stage.renderer, (f) => this.step(f * 0.8), this.choice.quality, old);
      // Compile the new world's shaders in the background (on the way in the game draws nothing, so no shaders are built for the old world).
      if (revision === this.revision) { await this.step(0.85); await this.stage.precompile(next.root); }
      if (revision !== this.revision) { disposeWorld(next, old); continue; }
      this.stage.scene.remove(old.root);
      this.stage.scene.add(next.root);
      await this.host.replaceWorld(next, (done, total) => this.step(0.9 + 0.1 * done / total));
      disposeWorld(old, next);
    } while (revision !== this.revision);
  }
}
