import * as THREE from 'three';
import { getGraphics, onGraphicsChange, QUALITY } from '@/config/graphics';
import { createPostChain, type PostChain } from '@/render/post';
import { createRenderer, setRendererQuality, type QualityPreset } from '@/render/renderer';
import { createLighting, createSkyEnvironment, type SceneLighting } from '@/world/lighting';
import { createSky, type Sky } from '@/world/sky';

/** Renderer, scene, camera, sky, lights and post chain, all driven by the graphics config. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sky: Sky;
  readonly lighting: SceneLighting;
  readonly post: PostChain;
  private quality: QualityPreset;

  constructor(private readonly container: HTMLElement, quality: QualityPreset) {
    this.quality = quality;
    this.renderer = createRenderer({ quality });
    // The canvas always fills the game area (CSS); resize() only sets its pixel size.
    Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    container.appendChild(this.renderer.domElement);
    const g = getGraphics();
    this.camera = new THREE.PerspectiveCamera(g.fov, 1, 0.1, 16000);
    this.sky = createSky(this.scene);
    this.lighting = createLighting(this.scene, quality);
    this.scene.environment = createSkyEnvironment(this.renderer, this.sky.dome);
    this.post = createPostChain(this.renderer, QUALITY[quality].msaa);
    this.post.setEnabled(QUALITY[quality].post, QUALITY[quality].msaa);
    this.applyGraphics();
    onGraphicsChange(() => this.applyGraphics());
    // The game area's own size, not the window's: on a phone, window.innerWidth/innerHeight
    // follow the zoomed visual viewport and lag behind a turn of the phone.
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  applyGraphics(): void {
    const g = getGraphics();
    this.sky.apply(g);
    this.lighting.apply(g);
    this.post.apply(g);
    this.renderer.toneMappingExposure = g.exposure;
  }

  /** Rebuilds the environment map (after sky changes that should reach reflections). */
  refreshEnvironment(): void {
    const old = this.scene.environment;
    this.scene.environment = createSkyEnvironment(this.renderer, this.sky.dome);
    old?.dispose();
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    setRendererQuality(this.renderer, q);
    this.lighting.setQuality(q);
    this.post.setEnabled(QUALITY[q].post, QUALITY[q].msaa);
    this.resize();
  }

  get qualityPreset(): QualityPreset {
    return this.quality;
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(focus: THREE.Vector3): void {
    this.lighting.follow(focus);
    this.sky.follow(this.camera);
    this.post.render(this.scene, this.camera);
  }
}
