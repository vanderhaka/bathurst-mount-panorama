import * as THREE from 'three';

/** Short exposure streaks (at most two pixels per 1000 px), High only. */
export function motionBlurAmount(speedMs: number, strength: number, enabled: boolean, high: boolean): number {
  if (!enabled || !high || !Number.isFinite(speedMs)) return 0;
  const velocity = THREE.MathUtils.clamp((Math.abs(speedMs) - 35) / 45, 0, 1);
  return velocity * THREE.MathUtils.clamp(strength, 0, 1) * 0.002;
}

/** Infinite-distance projection: translating the car cannot move the sun in the sky. */
export function sunInView(camera: THREE.Camera, direction: THREE.Vector3): { visible: boolean; uv: THREE.Vector2 } {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const ndc = direction.clone().normalize().multiplyScalar(1000).add(camera.position).project(camera);
  return {
    visible: direction.y > 0 && direction.dot(forward) > 0 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1,
    uv: new THREE.Vector2(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5),
  };
}

export const CAMERA_EFFECT_GLSL = /* glsl */ `
  uniform float motionBlur;
  uniform vec2 sunUv;
  uniform float flareStrength;
  vec4 exposedScene(sampler2D scene, vec2 uv) {
    if (motionBlur <= 0.0) return texture2D(scene, uv);
    vec2 streak = (uv - vec2(0.5)) * motionBlur;
    return (texture2D(scene, uv) * 0.4
      + texture2D(scene, uv - streak) * 0.3
      + texture2D(scene, uv + streak) * 0.3);
  }
  vec3 sunFlare(vec2 uv) {
    if (flareStrength <= 0.0) return vec3(0.0);
    vec2 axis = vec2(0.5) - sunUv;
    float glint = exp(-length(uv - sunUv) * 75.0);
    float ghost = exp(-length(uv - (vec2(0.5) + axis * 0.7)) * 42.0);
    float halo = exp(-pow((length(uv - sunUv) - 0.065) * 140.0, 2.0));
    return flareStrength * (vec3(1.0, 0.88, 0.62) * (glint + halo * 0.15)
      + vec3(0.45, 0.58, 0.7) * ghost * 0.2);
  }
`;
