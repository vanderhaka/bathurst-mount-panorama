import * as THREE from 'three';
import type { GraphicsConfig } from '@/config/graphics';

/**
 * Minimal post chain: the scene renders into one MSAA half-float target, then a
 * single full-screen pass does tone mapping, sRGB output and the colour grade
 * (saturation, contrast, warmth, black lift, vignette). One extra pass only.
 */
export interface PostChain {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  setEnabled(enabled: boolean, msaa: number): void;
  apply(cfg: GraphicsConfig): void;
  dispose(): void;
}

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform float saturation;
  uniform float contrast;
  uniform float warmth;
  uniform float blackLift;
  uniform float vignette;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(tScene, vUv);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, saturation);
    c = (c - 0.5) * contrast + 0.5;
    c += vec3(warmth, warmth * 0.35, -warmth);
    c = c * (1.0 - blackLift) + blackLift;
    vec2 q = vUv - 0.5;
    c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function createPostChain(renderer: THREE.WebGLRenderer, msaa = 4): PostChain {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  let target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa, colorSpace: THREE.LinearSRGBColorSpace });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: target.texture },
      saturation: { value: 1 },
      contrast: { value: 1 },
      warmth: { value: 0 },
      blackLift: { value: 0 },
      vignette: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let enabled = true;

  return {
    render(scene, camera) {
      if (!enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    },
    setSize(width, height) {
      const pr = renderer.getPixelRatio();
      target.setSize(Math.floor(width * pr), Math.floor(height * pr));
    },
    setEnabled(on, samples) {
      enabled = on;
      if (target.samples !== samples) {
        const { width, height } = target;
        target.dispose();
        target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples, colorSpace: THREE.LinearSRGBColorSpace });
        material.uniforms.tScene.value = target.texture;
      }
    },
    apply(cfg) {
      renderer.toneMappingExposure = cfg.exposure;
      material.uniforms.saturation.value = cfg.saturation;
      material.uniforms.contrast.value = cfg.contrast;
      material.uniforms.warmth.value = cfg.warmth;
      material.uniforms.blackLift.value = cfg.blackLift;
      material.uniforms.vignette.value = cfg.vignette;
    },
    dispose() {
      target.dispose();
      material.dispose();
    },
  };
}
