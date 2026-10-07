import * as THREE from 'three';
import type { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/** The lookup tables and extra buffers are loaded only when High requests SMAA. */
export class CameraAntialias {
  private pass: SMAAPass | null = null;
  private target: THREE.WebGLRenderTarget | null = null;
  private enabled = false;
  private loading = false;
  private width = 1;
  private height = 1;
  private disposed = false;

  configure(enabled: boolean, width: number, height: number): void {
    this.enabled = enabled && !this.disposed;
    this.width = width; this.height = height;
    if (!this.enabled) {
      this.pass?.dispose(); this.pass = null;
      this.target?.dispose(); this.target = null;
      return;
    }
    if (this.pass) {
      this.pass.setSize(width, height);
      this.target?.setSize(width, height);
    } else if (!this.loading) {
      this.loading = true;
      void import('three/addons/postprocessing/SMAAPass.js').then(({ SMAAPass }) => {
        if (!this.enabled || this.disposed) return;
        this.pass = new SMAAPass();
        this.pass.setSize(this.width, this.height);
        this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
          type: THREE.HalfFloatType, depthBuffer: false, colorSpace: THREE.LinearSRGBColorSpace,
        });
      }).catch(() => { this.enabled = false; }).finally(() => { this.loading = false; });
    }
  }

  render(renderer: THREE.WebGLRenderer, input: THREE.WebGLRenderTarget): THREE.Texture {
    if (!this.pass || !this.target) return input.texture;
    // r186 SMAA works in linear sRGB, before the colour grade/output transform.
    this.pass.render(renderer, this.target, input, 0, false);
    return this.target.texture;
  }

  dispose(): void {
    this.disposed = true;
    this.configure(false, this.width, this.height);
  }
}
