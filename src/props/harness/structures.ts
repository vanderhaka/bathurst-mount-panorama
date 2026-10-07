import * as THREE from 'three';
import { structures } from '@/props/structures';

// Harness helper: builds one structure with default options (overridable from URL params).

export function buildStructureView(scene: THREE.Scene, name: string, params: URLSearchParams) {
  const num = (k: string, d: number) => Number(params.get(k) ?? d);
  let g: THREE.Group;
  switch (name) {
    case 'pitBuilding':
      g = structures.pitBuilding({ length: num('length', 160), garages: num('garages', 16) });
      break;
    case 'controlTower':
      g = structures.controlTower({ height: num('height', 18) });
      break;
    case 'grandstand':
      g = structures.grandstand({ length: num('length', 50), rows: num('rows', 14), roof: params.get('roof') !== '0', crowd: num('crowd', 0.6) });
      break;
    case 'startGantry':
      g = structures.startGantry({ span: num('span', 18), height: num('height', 6.5) });
      break;
    case 'footBridge':
      g = structures.footBridge({ span: num('span', 22), clearance: num('clearance', 5.5) });
      break;
    case 'videoScreen':
      g = structures.videoScreen({ width: num('width', 10) });
      break;
    case 'building':
      g = structures.building({ width: num('width', 24), depth: num('depth', 12), height: num('height', 4.5), style: (params.get('style') ?? 'museum') as 'museum' });
      break;
    case 'hillsideLetters':
      g = structures.hillsideLetters({ text: params.get('text') ?? 'MOUNT PANORAMA', letterHeight: num('letterHeight', 6) });
      break;
    default:
      throw new Error(`Unknown structure ${name}`);
  }
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  let tris = 0;
  let meshes = 0;
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      meshes++;
      const geo = o.geometry as THREE.BufferGeometry;
      tris += geo.index ? geo.index.count / 3 : geo.getAttribute('position').count / 3;
    }
  });
  const dist = Math.max(size.x, size.y * 1.6, 8) * 1.15;
  return { target: centre, dist, stats: { meshes, structureTriangles: tris, size: size.toArray().map((v) => Math.round(v * 10) / 10) } };
}
