import * as THREE from 'three';

/** detailMotion=(movement weight, stable phase, rate). Shadows deliberately stay off. */
export function createDetailMotionMaterial(amplitude: number, frequency = 0.8) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const motion = { value: Math.max(0, Math.min(0.07, amplitude)) }, time = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.uDetailTime = time; shader.uniforms.uDetailAmplitude = motion;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 detailMotion; uniform float uDetailTime; uniform float uDetailAmplitude;`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float detailPhase = uDetailTime * ${Math.max(0.1, Math.min(3, frequency)).toFixed(3)} * detailMotion.z + detailMotion.y;
      #ifdef USE_INSTANCING
        detailPhase += instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.043;
      #endif
      float detailWeight = detailMotion.x * uDetailAmplitude;
      transformed.x += sin(detailPhase) * detailWeight;
      transformed.z += sin(detailPhase * 0.73 + 0.9) * detailWeight * 0.5;`);
  };
  material.customProgramCacheKey = () => `detail-motion-2:${frequency}`;
  return {
    material,
    amplitude: () => motion.value,
    setAmplitude: (value: number) => { motion.value = Math.max(0, Math.min(0.07, Number.isFinite(value) ? value : 0)); },
    update: (seconds: number) => { if (Number.isFinite(seconds)) time.value = seconds; },
  };
}
