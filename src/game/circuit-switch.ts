// Switching circuit from the title screen without reloading the page: the new world is built (and its shaders
// compiled) while the old circuit keeps rendering behind the menu, then Game swaps it in. This file holds the
// request logic (newest request wins) and the sequence; Game supplies the host that touches the scene.
import type { CircuitId } from '@/track/circuits';
import type { QualityPreset } from '@/render/renderer';
import type { Menus } from '@/types/hud';
import type { ProgressFn, World } from '@/world/world';

export interface CircuitSwitchHost {
  /** Circuit of the world in use. */
  active(): CircuitId;
  /** Only the title screen may switch (never during a race, car select or graphics change). */
  allowed(): boolean;
  quality(): QualityPreset;
  build(circuit: CircuitId, quality: QualityPreset, progress: ProgressFn): Promise<World>;
  precompile(world: World): Promise<void>;
  /** Resolves once no graphics rebuild of the current world is in flight. */
  idle(): Promise<void>;
  /** Puts `next` to use (scene, camera, line, effects, HUD, probes) and disposes the old world. */
  install(next: World, pause: (done: number, total: number) => Promise<void>): Promise<void>;
  discard(world: World): void;
  ui: Pick<Menus, 'showCircuitSwitch' | 'endCircuitSwitch'>;
}

/** Quick cycling through the Circuit row only builds the circuit it rests on. */
export const SWITCH_SETTLE_MS = 300;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class CircuitSwitch {
  private target: CircuitId;
  private running = false;

  constructor(private readonly host: CircuitSwitchHost, private readonly settleMs = SWITCH_SETTLE_MS) {
    this.target = host.active();
  }

  /** A switch is under way (a race must not start on a half-swapped world). */
  get busy(): boolean { return this.running; }

  /** The newest request replaces older ones; a build already running for an older one is thrown away when done. */
  request(circuit: CircuitId): void {
    if (!this.host.allowed()) return;
    this.target = circuit;
    if (this.running) {
      this.host.ui.showCircuitSwitch(circuit, 0, circuit === this.host.active() ? 'Finishing the last load' : 'Waiting');
      return;
    }
    if (circuit === this.host.active()) { this.host.ui.endCircuitSwitch(); return; }
    this.running = true;
    void this.run();
  }

  private async run(): Promise<void> {
    const { host } = this;
    try {
      while (this.target !== host.active() && host.allowed()) {
        host.ui.showCircuitSwitch(this.target, 0, 'Waiting');
        await wait(this.settleMs);
        const want = this.target;
        if (want === host.active() || !host.allowed()) break;
        const quality = host.quality();
        const stale = (): boolean => this.target !== want;
        const show = (fraction: number, label: string): void => { if (!stale()) host.ui.showCircuitSwitch(want, fraction, label); };
        show(0.01, 'Starting');
        const next = await host.build(want, quality, async (f, label) => { show(f * 0.8, label); await yieldToEventLoop(); });
        if (!stale()) { show(0.85, 'Preparing shaders'); await host.precompile(next); }
        if (!stale()) await host.idle();
        // Older request, another graphics tier meanwhile, or the player left the title screen: this world is not wanted.
        if (stale() || host.quality() !== quality || !host.allowed()) { host.discard(next); continue; }
        await host.install(next, async (done, total) => { show(0.9 + 0.1 * done / Math.max(1, total), 'Placing reflections'); await yieldToEventLoop(); });
      }
      host.ui.endCircuitSwitch();
    } catch (error) {
      console.warn('Circuit switch failed', error);
      this.target = host.active();
      host.ui.endCircuitSwitch('Could not load that circuit. Try again.');
    } finally {
      this.running = false;
    }
  }
}
