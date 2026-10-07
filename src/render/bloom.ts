import * as THREE from 'three';
import type { GraphicsConfig } from '@/config/graphics';

/** Quarter-resolution separable bloom; two cheap passes, allocated only on High. */
export interface Bloom {
  render(renderer: THREE.WebGLRenderer, source: THREE.Texture, cfg: GraphicsConfig): THREE.Texture;
  setSize(width: number, height: number): void;
  dispose(): void;
}

const fragment = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 direction;
  uniform float threshold;
  uniform bool prefilter;
  varying vec2 vUv;
  vec3 sampleBright(vec2 uv) {
    vec3 c = texture2D(tInput, uv).rgb;
    if (prefilter) {
      float brightness = max(max(c.r, c.g), c.b);
      float knee = max(threshold * 0.25, 0.001);
      float soft = clamp(brightness - threshold + knee, 0.0, knee * 2.0);
      soft = soft * soft / (4.0 * knee);
      c *= max(brightness - threshold, soft) / max(brightness, 0.001);
      c = min(c, vec3(16.0));
    }
    return c;
  }
  void main() {
    vec3 colour = sampleBright(vUv) * 0.227027;
    colour += (sampleBright(vUv + direction) + sampleBright(vUv - direction)) * 0.1945946;
    colour += (sampleBright(vUv + direction * 2.0) + sampleBright(vUv - direction * 2.0)) * 0.1216216;
    colour += (sampleBright(vUv + direction * 3.0) + sampleBright(vUv - direction * 3.0)) * 0.054054;
    colour += (sampleBright(vUv + direction * 4.0) + sampleBright(vUv - direction * 4.0)) * 0.016216;
    gl_FragColor = vec4(colour, 1.0);
  }
`;

export function createBloom(width: number, height: number): Bloom {
  const makeTarget = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, colorSpace: THREE.LinearSRGBColorSpace });
  const horizontal = makeTarget(), vertical = makeTarget();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      direction: { value: new THREE.Vector2() },
      threshold: { value: 2.2 },
      prefilter: { value: true },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const setSize = (w: number, h: number) => {
    horizontal.setSize(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4)));
    vertical.setSize(horizontal.width, horizontal.height);
  };
  setSize(width, height);
  return {
    render(renderer, source, cfg) {
      material.uniforms.threshold.value = cfg.bloomThreshold;
      material.uniforms.tInput.value = source;
      material.uniforms.prefilter.value = true;
      material.uniforms.direction.value.set(cfg.bloomRadius / horizontal.width, 0);
      renderer.setRenderTarget(horizontal);
      renderer.render(scene, camera);
      material.uniforms.tInput.value = horizontal.texture;
      material.uniforms.prefilter.value = false;
      material.uniforms.direction.value.set(0, cfg.bloomRadius / vertical.height);
      renderer.setRenderTarget(vertical);
      renderer.render(scene, camera);
      return vertical.texture;
    },
    setSize,
    dispose() {
      horizontal.dispose();
      vertical.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
