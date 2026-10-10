import * as THREE from 'three';
import { getGraphics, onGraphicsChange, QUALITY } from '@/config/graphics';
import { createPostChain, type PostChain } from '@/render/post';
import { createRenderer, setRendererQuality, type QualityPreset } from '@/render/renderer';
import { createLighting, createSkyEnvironment, type SceneLighting } from '@/world/lighting';
import { createSky, SKY_GRAPHICS_KEYS, SUN_DIRECTION, type Sky } from '@/world/sky';

/** Renderer, scene, camera, sky, lights and post chain, all driven by the graphics config. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sky: Sky;
  readonly lighting: SceneLighting;
  readonly post: PostChain;
  private quality: QualityPreset;
  private environment: THREE.WebGLRenderTarget;
  private environmentTimer: number | null = null;
  /** Fixed when the WebGL context is created: only a page that starts on a tier without a post chain needs it. */
  private readonly nativeAntialias: boolean;

  constructor(private readonly container: HTMLElement, quality: QualityPreset, pixelRatio?: number) {
    this.quality = quality;
    this.nativeAntialias = !QUALITY[quality].post;
    this.renderer = createRenderer({ quality, pixelRatio, antialias: this.nativeAntialias });
    // The canvas always fills the game area (CSS); resize() only sets its pixel size.
    Object.assign(this.renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });
    container.appendChild(this.renderer.domElement);
    const g = getGraphics();
    this.camera = new THREE.PerspectiveCamera(g.fov, 1, 0.1, 16000);
    this.sky = createSky(this.scene, 9000, quality);
    this.lighting = createLighting(this.scene, quality, this.camera);
    this.environment = createSkyEnvironment(this.renderer, this.sky.dome, quality);
    this.scene.environment = this.environment.texture;
    this.post = createPostChain(this.renderer, QUALITY[quality].msaa);
    this.applyPost(quality);
    this.applyGraphics();
    onGraphicsChange((_cfg, changed) => {
      this.applyGraphics();
      if (changed.some((key) => SKY_GRAPHICS_KEYS.includes(key))) this.scheduleEnvironment();
    });
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
    if (this.environmentTimer !== null) window.clearTimeout(this.environmentTimer);
    this.environmentTimer = null;
    const old = this.environment;
    this.environment = createSkyEnvironment(this.renderer, this.sky.dome, this.quality);
    this.scene.environment = this.environment.texture;
    old.dispose();
  }

  private scheduleEnvironment(): void {
    // Limit PMREM work while dragging; sky, sun and shadows update immediately.
    if (this.environmentTimer === null) {
      this.environmentTimer = window.setTimeout(() => this.refreshEnvironment(), 120);
    }
  }

  setQuality(q: QualityPreset, pixelRatio?: number): void {
    if (q === this.quality) {
      setRendererQuality(this.renderer, q, pixelRatio);
      this.resize();
      return;
    }
    this.quality = q;
    setRendererQuality(this.renderer, q, pixelRatio);
    this.sky.setQuality(q);
    this.lighting.setQuality(q);
    this.applyPost(q);
    this.refreshEnvironment();
    this.resize();
  }

  /** A canvas without MSAA (the page started on Medium or High) keeps Low's edges smooth through the post chain's MSAA target. */
  private applyPost(q: QualityPreset): void {
    const tier = QUALITY[q];
    const viaPost = tier.post || !this.nativeAntialias;
    this.post.setEnabled(viaPost, tier.post ? tier.msaa : QUALITY.medium.msaa, tier.bloom, tier.screenAo, tier.cameraEffects);
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
    this.lighting.resize();
  }

  render(focus: THREE.Vector3, speed = 0, motionBlur = true): void {
    this.lighting.follow(focus);
    this.sky.follow(this.camera);
    this.post.setCameraEffects(speed, motionBlur, this.camera, SUN_DIRECTION);
    this.post.render(this.scene, this.camera);
  }
}
