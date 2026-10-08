import * as THREE from 'three';
import { getGraphics, type GraphicsConfig } from '@/config/graphics';
import { createBloom, type Bloom } from '@/render/bloom';
import { CameraAntialias } from '@/render/antialias';
import { CAMERA_EFFECT_GLSL, motionBlurAmount, sunInView } from '@/render/camera-effects';
import { TONE_MAPPING } from '@/render/tone-mapping';
import type { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/**
 * Minimal post chain: the scene renders into one MSAA half-float target, then a
 * final full-screen pass does tone mapping, sRGB output and the colour grade.
 * High adds two quarter-resolution passes for bright HDR glints before output.
 */
export interface PostChain {
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  setSize(width: number, height: number): void;
  setEnabled(enabled: boolean, msaa: number, bloom?: boolean, ao?: boolean, cameraEffects?: boolean): void;
  setCameraEffects(speedMs: number, blur: boolean, camera: THREE.Camera, sun: THREE.Vector3): void;
  apply(cfg: GraphicsConfig): void;
  dispose(): void;
}

const fragmentShader = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tAo;
  uniform float aoStrength;
  uniform float bloomStrength;
  uniform float saturation;
  uniform float contrast;
  uniform float warmth;
  uniform float blackLift;
  uniform float vignette;
  varying vec2 vUv;
  ${CAMERA_EFFECT_GLSL}
  void main() {
    gl_FragColor = exposedScene(tScene, vUv);
    gl_FragColor.rgb *= mix(1.0, texture2D(tAo, vUv).r, aoStrength);
    gl_FragColor.rgb += texture2D(tBloom, vUv).rgb * bloomStrength + sunFlare(vUv);
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
  const sceneTarget = (width: number, height: number, samples: number, depth: boolean) => new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, samples, colorSpace: THREE.LinearSRGBColorSpace,
    depthTexture: depth ? new THREE.DepthTexture(width, height, THREE.UnsignedIntType) : null,
  });
  let width = size.x, height = size.y, samples = msaa;
  let target: THREE.WebGLRenderTarget | null = null;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      tAo: { value: null },
      motionBlur: { value: 0 },
      sunUv: { value: new THREE.Vector2() },
      flareStrength: { value: 0 },
      aoStrength: { value: 0 },
      bloomStrength: { value: 0 },
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
  let tierBloom = true;
  let tierAo = false;
  let tierCamera = false;
  const aa = new CameraAntialias();
  const sunView = { visible: false, uv: new THREE.Vector2() };
  const updateAa = () => aa.configure(enabled && tierCamera && cfg.smaa, width, height);
  let ao: GTAOPass | null = null;
  let Gtao: typeof GTAOPass | null = null;
  let aoLoading = false;
  let bloom: Bloom | null = null;
  let cfg = getGraphics();

  const updateBloom = () => {
    if (target && enabled && tierBloom && cfg.bloom && cfg.bloomStrength > 0) {
      bloom ??= createBloom(target.width, target.height);
    } else {
      bloom?.dispose();
      bloom = null;
    }
    material.uniforms.bloomStrength.value = bloom ? cfg.bloomStrength : 0;
  };

  return {
    render(scene, camera) {
      if (!enabled) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }
      if (!target) {
        target = sceneTarget(width, height, samples, tierAo);
        material.uniforms.tScene.value = target.texture;
        material.uniforms.tAo.value = target.texture;
        updateBloom();
      }
      // Evidence must count the whole frame, rather than just the final quad.
      const autoReset = renderer.info.autoReset;
      if (autoReset) renderer.info.reset();
      renderer.info.autoReset = false;
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        if (tierAo && cfg.screenAo > 0) {
          if (!Gtao && !aoLoading) {
            aoLoading = true;
            void import('three/addons/postprocessing/GTAOPass.js').then(module => { Gtao = module.GTAOPass; }).catch(() => {});
          }
          if (!ao && Gtao) {
            ao = new Gtao(scene, camera, Math.floor(target.width / 2), Math.floor(target.height / 2));
            // The visible pass includes alpha-tested foliage and its shader wind.
            // Reconstruct normals from its depth instead of drawing solid cards again.
            ao.setGBuffer(target.depthTexture!);
            ao.output = Gtao.OUTPUT.Off;
            ao.updateGtaoMaterial({ radius: 2, samples: 8, thickness: 1, screenSpaceRadius: false });
            ao.updatePdMaterial({ samples: 8, radius: 2 });
            ao.setSize(Math.floor(target.width / 2), Math.floor(target.height / 2));
          }
          if (ao) {
            ao.render(renderer, target, target, 0, false);
            material.uniforms.tAo.value = ao.gtaoMap;
          }
        }
        material.uniforms.aoStrength.value = ao && tierAo ? cfg.screenAo : 0;
        material.uniforms.tBloom.value = bloom ? bloom.render(renderer, target.texture, cfg) : target.texture;
        material.uniforms.tScene.value = aa.render(renderer, target);
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCamera);
      } finally {
        renderer.info.autoReset = autoReset;
      }
    },
    setSize(w, h) {
      const pr = renderer.getPixelRatio();
      width = Math.max(1, Math.floor(w * pr)); height = Math.max(1, Math.floor(h * pr));
      target?.setSize(width, height);
      bloom?.setSize(width, height);
      ao?.setSize(Math.floor(width / 2), Math.floor(height / 2));
      updateAa();
    },
    setEnabled(on, nextSamples, highBloom = false, highAo = false, highCamera = false) {
      enabled = on;
      tierBloom = highBloom;
      tierAo = highAo && enabled;
      tierCamera = highCamera && enabled;
      samples = nextSamples;
      if (!tierAo) { ao?.dispose(); ao = null; material.uniforms.aoStrength.value = 0; }
      if (!enabled || (target && (target.samples !== samples || Boolean(target.depthTexture) !== tierAo))) {
        target?.dispose(); target = null;
        ao?.dispose(); ao = null;
        material.uniforms.tScene.value = material.uniforms.tBloom.value = material.uniforms.tAo.value = null;
      } else if (!ao) material.uniforms.tAo.value = target?.texture ?? null;
      updateBloom();
      updateAa();
    },
    setCameraEffects(speed, blur, camera, direction) {
      const sun = sunInView(camera, direction, sunView);
      material.uniforms.motionBlur.value = motionBlurAmount(speed, cfg.cameraBlurStrength, blur, tierCamera);
      material.uniforms.sunUv.value.copy(sun.uv);
      material.uniforms.flareStrength.value = tierCamera && sun.visible ? cfg.sunFlareStrength : 0;
    },
    apply(next) {
      cfg = next;
      renderer.toneMapping = TONE_MAPPING[cfg.toneMapping];
      renderer.toneMappingExposure = cfg.exposure;
      material.uniforms.saturation.value = cfg.saturation;
      material.uniforms.contrast.value = cfg.contrast;
      material.uniforms.warmth.value = cfg.warmth;
      material.uniforms.blackLift.value = cfg.blackLift;
      material.uniforms.vignette.value = cfg.vignette;
      updateBloom();
      updateAa();
    },
    dispose() {
      target?.dispose();
      aa.dispose();
      bloom?.dispose();
      ao?.dispose();
      material.dispose();
      quad.geometry.dispose();
    },
  };
}
