import * as THREE from 'three';
import { GROUND } from '@/art/palette';
import { grassLayout, type GrassGround, type GrassSettings } from '@/world/grass-layout';

export interface NearGrass {
  group: THREE.Group;
  mesh?: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Call before rendering with the camera world x/z and elapsed seconds. */
  update(x: number, z: number, seconds: number): void;
  setWind(strength: number): void;
  dispose(): void;
}

function bladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // A bent, tapered strip: four triangles per blade, no downloaded alpha texture.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.3, 0.5, 0.08, 0.3, 0.5, 0.08, -0.02, 1, 0.2, 0.02, 1, 0.2], 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1, 1, 1, 1, 1, 1], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

/** One bounded instance draw. Phone tiers allocate nothing when their switch is off. */
export function createNearGrass(ground: (x: number, z: number) => GrassGround, settings: GrassSettings): NearGrass {
  const group = new THREE.Group();
  group.name = 'near-grass';
  if (!settings.enabled || settings.capacity <= 0 || settings.density <= 0) return { group, update: () => {}, setWind: () => {}, dispose: () => {} };
  const capacity = Math.max(1, Math.min(8192, Math.floor(settings.capacity)));
  const radius = Math.max(1, Math.min(80, settings.radius));
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.96 });
  material.name = 'near-grass-wind';
  const time = { value: 0 }, wind = { value: Math.max(0, Math.min(2, settings.wind)) }, focus = { value: new THREE.Vector2() };
  const extent = { value: radius };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grassTime = time;
    shader.uniforms.grassWind = wind;
    shader.uniforms.grassFocus = focus;
    shader.uniforms.grassRadius = extent;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float grassTime;\nuniform float grassWind;\nuniform vec2 grassFocus;\nuniform float grassRadius;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 grassWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        float tip = position.y * position.y;
        float wave = sin(grassTime * 1.7 + grassWorld.x * 0.17 + grassWorld.z * 0.11);
        float aspect = length(instanceMatrix[1].xyz) / max(0.001, length(instanceMatrix[0].xyz));
        transformed.x += wave * grassWind * tip * aspect * 0.14;
        transformed.z += sin(grassTime * 1.1 + grassWorld.z * 0.19) * grassWind * tip * aspect * 0.09;
        // An 8 m margin covers the 8 m camera anchor's diagonal jump.
        float outer = max(0.5, grassRadius - 8.0);
        float edge = 1.0 - smoothstep(max(0.0, outer - 10.0), outer, distance(grassWorld.xz, grassFocus));
        transformed *= edge;`);
  };
  material.customProgramCacheKey = () => 'near-grass-wind-v2';
  const geometry = bladeGeometry();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'near-grass-blades';
  mesh.count = 0;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  const transform = new THREE.Object3D(), colour = new THREE.Color();
  const green = new THREE.Color(GROUND.grass), dry = new THREE.Color(GROUND.grassDry);
  let patchX = Infinity, patchZ = Infinity, disposed = false;
  const update = (x: number, z: number, seconds: number) => {
    if (disposed) return;
    time.value = seconds;
    focus.value.set(x, z);
    const px = Math.round(x / 8) * 8, pz = Math.round(z / 8) * 8;
    if (px === patchX && pz === patchZ) return;
    patchX = px; patchZ = pz;
    const blades = grassLayout(px, pz, ground, { ...settings, radius, capacity });
    const farthest = blades.at(-1);
    extent.value = blades.length === capacity && farthest ? Math.min(radius, Math.hypot(farthest.x - px, farthest.z - pz)) : radius;
    for (let i = 0; i < blades.length; i++) {
      const b = blades[i];
      transform.position.set(b.x, b.y, b.z);
      transform.rotation.set(0, b.angle, 0);
      transform.scale.set(b.width, b.height, b.width);
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
      mesh.setColorAt(i, colour.copy(green).lerp(dry, b.dry));
    }
    mesh.count = blades.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (mesh.count) mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.25;
  };
  return {
    group, mesh, update,
    setWind: strength => { wind.value = Math.max(0, Math.min(2, strength)); },
    dispose: () => { if (disposed) return; disposed = true; group.remove(mesh); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
