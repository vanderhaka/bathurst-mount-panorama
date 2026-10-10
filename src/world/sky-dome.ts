import * as THREE from 'three';
import type { GraphicsConfig } from '@/config/graphics';

/** The tuned colours are display colours; the physical sky is HDR, so the dome is scaled to match it at the default exposure. */
const DOME_RADIANCE = 2.2;

/** Low-cost scattering approximation for phones: blue zenith, pale horizon, narrow solar disc. */
export function createTunedDome(radius: number, sun: THREE.Vector3): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColour: { value: new THREE.Color() },
      sunDir: { value: sun },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, sunColour, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float height = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(height, 0.45));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColour * (pow(s, 24.0) * 0.12 + pow(s, 4.0) * 0.04);
        col += sunColour * smoothstep(0.999987, 0.999991, s) * 24.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    // Far-plane depth (p.xyww) with a depth test: only uncovered pixels are shaded (sky.ts draws it last).
    depthTest: true,
    fog: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), material);
}

export function applyTunedDome(material: THREE.ShaderMaterial, cfg: GraphicsConfig): void {
  material.uniforms.zenith.value.set(cfg.skyZenith).multiplyScalar(DOME_RADIANCE);
  material.uniforms.horizon.value.set(cfg.skyHorizon).multiplyScalar(DOME_RADIANCE);
  material.uniforms.sunColour.value.set(cfg.sunColour);
}
