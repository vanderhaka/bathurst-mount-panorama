// Proxy surroundings for the car environment capture: asphalt, grass and distant
// hills so reflections show more than sky + a flat nadir disc.
import * as THREE from 'three';
import { FOLIAGE, GROUND, ROAD } from '@/art/palette';

const ASPHALT = new THREE.Color(ROAD.asphalt);
const GRASS = new THREE.Color(GROUND.grass);
const GRASS_DRY = new THREE.Color(GROUND.grassDry);
const HILL = new THREE.Color(FOLIAGE.eucalyptOlive);
const HILL_FAR = new THREE.Color(FOLIAGE.eucalyptBlueGrey);

/** Adds a ringed ground and simple hill silhouettes into an environment-capture scene. */
export function addEnvSurroundings(envScene: THREE.Scene): THREE.Object3D[] {
  const built: THREE.Object3D[] = [];
  const asphalt = new THREE.Mesh(
    new THREE.CircleGeometry(28, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ASPHALT, fog: false }),
  );
  asphalt.position.y = -0.5;
  envScene.add(asphalt);
  built.push(asphalt);

  const grassGeo = new THREE.RingGeometry(28, 95, 48).rotateX(-Math.PI / 2);
  const gPos = grassGeo.getAttribute('position');
  const gCol = new Float32Array(gPos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < gPos.count; i++) {
    const t = Math.min(1, (Math.hypot(gPos.getX(i), gPos.getZ(i)) - 28) / 67);
    c.copy(GRASS).lerp(GRASS_DRY, t * 0.55).toArray(gCol, i * 3);
  }
  grassGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
  const grass = new THREE.Mesh(grassGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  grass.position.y = -0.6;
  envScene.add(grass);
  built.push(grass);

  // Soft hill silhouettes around the horizon (reflections of bush / ridge, not geometry).
  const hills = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const r = 72 + (i % 3) * 6;
    const h = 10 + (i % 4) * 3.5;
    const w = 18 + (i % 3) * 8;
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? HILL : HILL_FAR, fog: false }),
    );
    hill.scale.set(w * 0.5, h, w * 0.35);
    hill.position.set(Math.sin(a) * r, -1, Math.cos(a) * r);
    hills.add(hill);
  }
  envScene.add(hills);
  built.push(hills);
  return built;
}

/** Disposes geometry/materials of objects returned by addEnvSurroundings. */
export function disposeEnvSurroundings(objects: THREE.Object3D[]): void {
  for (const o of objects) {
    o.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const m = child.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    });
  }
}
