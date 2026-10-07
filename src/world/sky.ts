import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKY } from '@/art/palette';
import { paintGeometry, vertexColourMaterial } from '@/art/materials';

/** Direction towards the sun: October afternoon, sun in the north-west (north is -Z), ~38 degrees high. */
export const SUN_DIRECTION = new THREE.Vector3(-0.52, 0.62, -0.58).normalize();

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 mid;
  uniform vec3 horizon;
  uniform vec3 sunColour;
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(mix(horizon, mid, smoothstep(0.0, 0.18, h)), zenith, smoothstep(0.15, 0.85, h))
      : mix(horizon, horizon * 0.82, smoothstep(0.0, -0.2, h));
    float s = max(dot(d, sunDir), 0.0);
    col += sunColour * (pow(s, 600.0) * 18.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface Sky {
  dome: THREE.Mesh;
  clouds: THREE.Mesh;
  /** Keeps the dome centred on the camera. */
  follow(camera: THREE.Camera): void;
}

export function createSky(scene: THREE.Scene, radius = 9000): Sky {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(SKY.zenith) },
      mid: { value: new THREE.Color(SKY.mid) },
      horizon: { value: new THREE.Color(SKY.horizon) },
      sunColour: { value: new THREE.Color(SKY.sun) },
      sunDir: { value: SUN_DIRECTION.clone() },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), material);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.name = 'sky-dome';
  scene.add(dome);

  const clouds = createClouds();
  scene.add(clouds);

  return {
    dome,
    clouds,
    follow(camera) {
      dome.position.copy(camera.position);
    },
  };
}

/** Medium-poly cumulus puffs: flattened icosahedra merged into one mesh. */
function createClouds(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 26; c++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 2600 + rnd() * 4200;
    const cx = Math.cos(ang) * dist;
    const cz = Math.sin(ang) * dist;
    const cy = 1500 + rnd() * 700;
    const puffs = 4 + Math.floor(rnd() * 5);
    for (let p = 0; p < puffs; p++) {
      const r = 90 + rnd() * 160;
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1.6, 0.62, 1.2);
      g.translate(cx + (rnd() - 0.5) * 520, cy + rnd() * 70, cz + (rnd() - 0.5) * 300);
      paintGeometry(g, 0xffffff, 0.04, c * 31 + p);
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts);
  const mat = vertexColourMaterial({ roughness: 1, flat: true, emissive: 0xc8d6e0, emissiveIntensity: 0.45 });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'clouds';
  return mesh;
}
