import * as THREE from 'three';

export const GUM_WIND_PADDING = 1.3;
export interface GumWindUniforms { time: { value: number }; amplitude: { value: number } }

/** Metres in asset space. Roots stay fixed; placement supplies the phase, not time per instance. */
export function gumWindOffset(point: THREE.Vector3, flex: THREE.Vector2, time: number, amplitude: number, root = new THREE.Vector2()): THREE.Vector3 {
  const phase = root.x * 0.017 + root.y * 0.011;
  const slow = Math.sin(time * 0.8 + phase) * 0.7 + Math.sin(time * 0.37 + phase * 1.3) * 0.15;
  const flutter = Math.sin(time * 3.8 + point.x * 2 + point.z + phase) * 0.06 * flex.y;
  return new THREE.Vector3((slow * flex.x + flutter) * amplitude, 0, (Math.cos(time * 0.61 + phase) * 0.35 * flex.x + flutter * 0.5) * amplitude);
}

const WIND_GLSL = /* glsl */ `
attribute vec2 treeWind;
uniform float gumTime;
uniform float gumAmplitude;
vec3 gumWindOffset(vec3 point, vec2 flex, vec2 root) {
  float phase = dot(root, vec2(0.017, 0.011));
  float slow = sin(gumTime * 0.8 + phase) * 0.7 + sin(gumTime * 0.37 + phase * 1.3) * 0.15;
  float flutter = sin(gumTime * 3.8 + point.x * 2.0 + point.z + phase) * 0.06 * flex.y;
  return vec3(slow * flex.x + flutter, 0.0, cos(gumTime * 0.61 + phase) * 0.35 * flex.x + flutter * 0.5) * gumAmplitude;
}`;

/** Wraps leaf tint, CSM or other material hooks instead of replacing them. Also use on shadows. */
export function installGumWind(material: THREE.Material, uniforms: GumWindUniforms): void {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    shader.uniforms.gumTime = uniforms.time; shader.uniforms.gumAmplitude = uniforms.amplitude;
    shader.vertexShader = WIND_GLSL + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 gumRoot = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_BATCHING
        gumRoot = batchingMatrix * gumRoot;
      #endif
      #ifdef USE_INSTANCING
        gumRoot = instanceMatrix * gumRoot;
      #endif
      gumRoot = modelMatrix * gumRoot;
      transformed += gumWindOffset(position, treeWind, gumRoot.xz);`);
  };
  material.customProgramCacheKey = function () { return `${key.call(this)}:gum-wind-v1`; };
  material.needsUpdate = true;
}

/** Apply after registry/instancer recomputes bounds; leaves can move outside their static box. */
export function padGumBounds(g: THREE.BufferGeometry, amplitude = 1): void {
  const flex = g.getAttribute('treeWind');
  if (!flex || !Array.from(flex.array).some((v) => v > 0)) return;
  g.computeBoundingBox(); g.computeBoundingSphere();
  const pad = GUM_WIND_PADDING * Math.max(0, Math.min(1, amplitude));
  if (g.boundingBox) { g.boundingBox.min.x -= pad; g.boundingBox.min.z -= pad; g.boundingBox.max.x += pad; g.boundingBox.max.z += pad; }
  if (g.boundingSphere) g.boundingSphere.radius += pad;
}
