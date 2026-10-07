import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { DEFAULT_GRAPHICS, exportGraphics, getGraphics, importGraphics, resetGraphics, saveGraphics, setGraphics, type GraphicsConfig } from '@/config/graphics';

interface LooseController { onChange(fn: (v: unknown) => void): LooseController }
interface LooseFolder {
  add(o: object, k: string, min?: number, max?: number, step?: number): LooseController;
  addColor(o: object, k: string): LooseController;
}

/**
 * Live graphics tuner (T or F2, or Settings > Graphics and audio). Sliders edit the
 * central graphics config; lighting,
 * fog, sky, colour grade and camera apply at once. World-content values apply
 * after "Rebuild world". "Copy settings" puts the changed values on the clipboard
 * so they can be sent back for permanent tuning.
 */
export class GraphicsTuner {
  private gui: GUI | null = null;
  private readonly model: GraphicsConfig = { ...getGraphics() };

  constructor(private readonly onRebuild: () => void, private readonly hud?: { setScale(n: number): void; setOpacity(n: number): void }) {}

  toggle(): void {
    if (this.gui) {
      this.gui.destroy();
      this.gui = null;
      return;
    }
    Object.assign(this.model, getGraphics());
    const gui = new GUI({ title: 'Graphics tuner (T)', width: 320 });
    gui.domElement.style.zIndex = '60';
    const live = (folder: GUI, key: keyof GraphicsConfig, min?: number, max?: number, step?: number) => {
      // lil-gui's generic typing cannot express a mixed-type config; use a loose view.
      const f = folder as unknown as LooseFolder;
      const c = typeof DEFAULT_GRAPHICS[key] === 'string' && String(DEFAULT_GRAPHICS[key]).startsWith('#')
        ? f.addColor(this.model, key)
        : f.add(this.model, key, min, max, step);
      c.onChange((v: unknown) => setGraphics({ [key]: v } as Partial<GraphicsConfig>));
      return c;
    };
    const light = gui.addFolder('Light & sky');
    live(light, 'exposure', 0.4, 2, 0.01);
    light.add(this.model, 'toneMapping', ['ACES', 'AgX', 'Neutral']).name('Tone mapping')
      .onChange((v: GraphicsConfig['toneMapping']) => setGraphics({ toneMapping: v }));
    light.add(this.model, 'timeOfDay', 7, 19, 0.05).name('Time (AEDT)')
      .onChange((v: number) => setGraphics({ timeOfDay: v }));
    live(light, 'sunIntensity', 0, 8, 0.05);
    live(light, 'sunColour');
    live(light, 'hemiIntensity', 0, 4, 0.05);
    live(light, 'hemiSky');
    live(light, 'hemiGround');
    live(light, 'envIntensity', 0, 2, 0.01);
    live(light, 'skyZenith');
    live(light, 'skyHorizon');
    live(light, 'physicalSky');
    live(light, 'skyTurbidity', 1, 10, 0.1);
    live(light, 'skyRayleigh', 0.1, 4, 0.05);
    live(light, 'skyMie', 0.001, 0.02, 0.0005);
    live(light, 'cloudCoverage', 0, 0.6, 0.01);
    live(light, 'fogColour');
    live(light, 'fogDensity', 0, 0.0005, 0.000005);
    live(light, 'aerialPerspective');
    live(light, 'hazeHeightFalloff', 0, 0.02, 0.0005);
    live(light, 'hazeSunWarmth', 0, 1, 0.01);
    const bloom = gui.addFolder('Bloom (High)');
    live(bloom, 'bloom');
    live(bloom, 'bloomStrength', 0, 0.5, 0.01);
    live(bloom, 'bloomThreshold', 0.5, 8, 0.1);
    live(bloom, 'bloomRadius', 0.5, 3, 0.1);
    const grade = gui.addFolder('Colour grade');
    live(grade, 'saturation', 0, 2, 0.01);
    live(grade, 'contrast', 0.5, 1.6, 0.01);
    live(grade, 'warmth', -0.15, 0.15, 0.005);
    live(grade, 'blackLift', -0.1, 0.15, 0.005);
    live(grade, 'vignette', 0, 1, 0.01);
    const cam = gui.addFolder('Camera');
    live(cam, 'fov', 40, 90, 1);
    live(cam, 'cameraShake', 0, 2, 0.05);
    const world = gui.addFolder('World (rebuild)');
    live(world, 'treeDensity', 0, 2, 0.05);
    live(world, 'terrainColourNoise', 0, 2, 0.05);
    live(world, 'rubberGroove', 0, 1, 0.01);
    live(world, 'grassTuftDensity', 0, 2, 0.05);
    live(world, 'treeLodDistance', 40, 600, 10);
    live(world, 'propDrawDistance', 300, 4000, 50);
    world.add({ rebuild: () => this.onRebuild() }, 'rebuild').name('Rebuild world');
    if (this.hud) {
      const hud = gui.addFolder('HUD');
      const h = { scale: 1, opacity: 1 };
      hud.add(h, 'scale', 0.6, 1.6, 0.01).onChange((v: number) => this.hud?.setScale(v));
      hud.add(h, 'opacity', 0.2, 1, 0.01).onChange((v: number) => this.hud?.setOpacity(v));
    }
    const io = gui.addFolder('Save / share');
    io.add({ save: () => saveGraphics() }, 'save').name('Save as my default');
    io.add({ copy: () => void navigator.clipboard?.writeText(exportGraphics()).catch(() => {}) }, 'copy').name('Copy settings (JSON)');
    io.add({ paste: () => {
      const text = window.prompt('Paste graphics settings JSON');
      if (text && importGraphics(text)) { Object.assign(this.model, getGraphics()); gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
    } }, 'paste').name('Paste settings');
    io.add({ reset: () => { resetGraphics(); Object.assign(this.model, getGraphics()); gui.controllersRecursive().forEach((c) => c.updateDisplay()); } }, 'reset').name('Reset to defaults');
    this.gui = gui;
  }
}
