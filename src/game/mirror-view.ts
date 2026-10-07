import * as THREE from 'three';
import type { CarModel } from '@/types/car-model';

/** Rear-view mirror resolution (about the mirror's 3:1 shape) and draw distance. */
const WIDTH = 384, HEIGHT = 128, FAR = 350;

/**
 * Live rear-view mirror for the cockpit camera: a small second render from the
 * driver's eye, looking backwards, into a texture that the car model shows on
 * its interior mirror. It renders only in the cockpit view, without the player's
 * own car and without a shadow-map update (the main render already did that).
 */
export class MirrorView {
  readonly target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { type: THREE.HalfFloatType, samples: 2 });
  private readonly camera = new THREE.PerspectiveCamera(26, WIDTH / HEIGHT, 0.3, FAR);
  private attached: CarModel | null = null;
  private eye: THREE.Object3D | null = null;
  private frame = 0;

  /** Call once per frame before the main render. */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, model: CarModel, active: boolean): void {
    if (this.attached !== model) {
      this.attached?.setMirrorTexture?.(null);
      model.setMirrorTexture?.(this.target.texture);
      this.attached = model;
      this.eye = model.root.getObjectByName('mirrorEye') ?? null;
    }
    // Half rate is plenty for a mirror and halves its cost.
    if (!active || this.frame++ % 2 === 1) return;
    // 'mirrorEye' sits at the mirror on the centreline and looks backwards like a three.js camera.
    const eye = this.eye;
    if (eye) {
      eye.getWorldPosition(this.camera.position);
      eye.getWorldQuaternion(this.camera.quaternion);
    } else {
      model.cockpitCamera.getWorldPosition(this.camera.position);
      model.root.getWorldQuaternion(this.camera.quaternion); // the root frame faces backwards in camera terms
    }
    this.camera.updateMatrixWorld();
    const wasVisible = model.root.visible;
    const autoShadows = renderer.shadowMap.autoUpdate;
    const prevTarget = renderer.getRenderTarget();
    model.root.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = autoShadows;
    model.root.visible = wasVisible;
  }

  detach(): void {
    this.attached?.setMirrorTexture?.(null);
    this.attached = null;
  }

  dispose(): void {
    this.detach();
    this.target.dispose();
  }
}

let shared: MirrorView | null = null;

/** The one mirror view of the app (one render target, reused between races). */
export function mirrorView(): MirrorView {
  if (!shared) shared = new MirrorView();
  return shared;
}
