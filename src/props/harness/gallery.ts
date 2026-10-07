import * as THREE from 'three';
import type { InstancedPropKind, PropAsset } from '@/types/props';
import { getPropAsset, PROP_VARIANTS } from '@/props/registry';
import { PROPS_LOOK } from '@/props/look';

// Harness helpers: rows of props (one InstancedMesh per kind × variant so the
// instancing + tint path is what gets rendered).

export type AddLabel = (text: string, at: THREE.Vector3) => void;

/** Gallery bands, laid side by side (left → right); inside a band, rows run front → back. */
export const GALLERY_BANDS: InstancedPropKind[][] = [
  ['grassTuft', 'rock', 'shrub', 'spectator', 'spectatorSeated', 'distanceBoard', 'tyreStack', 'trackPole', 'flagPole', 'portaloo', 'billboard', 'marshalPost'],
  ['tent', 'gazebo', 'roadCar', 'campervan', 'caravan', 'waterTank', 'lightPole', 'tvCameraTower', 'shed'],
  ['house', 'eucalyptusYoung', 'pine', 'eucalyptus'],
];

export function tintFor(kind: InstancedPropKind, i: number): number {
  const L = PROPS_LOOK;
  const list: Record<string, number[]> = {
    spectator: L.people.shirts,
    spectatorSeated: L.people.shirts,
    tent: L.camping.tentFly,
    gazebo: L.camping.gazebo,
    roadCar: L.vehicles.paint,
    caravan: L.camping.gazebo,
    campervan: L.camping.tentFly,
    billboard: L.camping.gazebo,
    flagPole: L.camping.gazebo,
  };
  const l = list[kind] ?? [0xffffff];
  return l[(i * 3 + 1) % l.length];
}

export function instance(asset: PropAsset, geometry: THREE.BufferGeometry, pos: THREE.Vector3, tint?: number, rotY = 0, scale = 1): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geometry, asset.material, 1);
  m.setMatrixAt(0, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, scale, scale)));
  if (asset.tintable && tint !== undefined) m.setColorAt(0, new THREE.Color().setHex(tint));
  m.castShadow = asset.castShadow;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

interface RowStats {
  variants: number;
  tris: number[];
  lodTris?: number[];
}

function rowStats(kind: InstancedPropKind): RowStats {
  const n = PROP_VARIANTS[kind];
  const assets = Array.from({ length: n }, (_, v) => getPropAsset(kind, v));
  const lod = assets.every((a) => a.lodGeometry) ? assets.map((a) => a.lodGeometry!.getAttribute('position').count / 3) : undefined;
  return { variants: n, tris: assets.map((a) => a.triangles), lodTris: lod };
}

/** Lays out every variant of one kind along X at depth z. Returns the row's width and depth. */
function layRow(scene: THREE.Scene, kind: InstancedPropKind, z: number, far: boolean, addLabel: AddLabel, scaleGap = 1.25, labelVariants = true, x0 = 0): { width: number; depth: number; height: number } {
  const n = PROP_VARIANTS[kind];
  const assets = Array.from({ length: n }, (_, v) => getPropAsset(kind, v));
  const maxR = Math.max(...assets.map((a) => a.radius));
  const step = Math.max(maxR * 2 * scaleGap, 1.2);
  const width = step * (n - 1);
  assets.forEach((a, v) => {
    const pos = new THREE.Vector3(x0 - width / 2 + v * step, 0, z);
    const geo = far && a.lodGeometry ? a.lodGeometry : a.geometry;
    scene.add(instance(a, geo, pos, tintFor(kind, v)));
    if (labelVariants) addLabel(`${v} · ${geo.getAttribute('position').count / 3}`, pos.clone().add(new THREE.Vector3(0, 0, Math.min(a.radius, 3) + 0.2)));
  });
  return { width, depth: maxR * 2 + 2, height: Math.max(...assets.map((a) => a.height)) };
}

export function buildKindRow(scene: THREE.Scene, kind: InstancedPropKind, far: boolean, addLabel: AddLabel) {
  const row = layRow(scene, kind, 0, far, addLabel, 1.05);
  const halfTan = Math.tan(THREE.MathUtils.degToRad(20)) * (innerWidth / innerHeight);
  const dist = Math.max((row.width / 2 + row.depth) / halfTan, row.height * 2.2);
  return { target: new THREE.Vector3(0, row.height * 0.45, 0), dist, stats: { [kind]: rowStats(kind) } };
}

/**
 * Overview grid: every kind in its own block (variants on two lines), each
 * instance scaled to a common size so everything is legible in one shot.
 * Real sizes: ?kind=<kind>, or ?scale=real for the banded real-size layout.
 */
export function buildGallery(scene: THREE.Scene, only: InstancedPropKind[] | undefined, addLabel: AddLabel, realScale = false) {
  if (realScale) return buildRealGallery(scene, only, addLabel);
  const stats: Record<string, RowStats> = {};
  const kinds = GALLERY_BANDS.flat().filter((k) => !only || only.includes(k));
  const cell = 3.2;
  const size = 2.6;
  const cols = 5;
  const blockW = cell * 4 + 2;
  const blockD = cell * 2 + 2.5;
  const rows = Math.ceil(kinds.length / cols);
  kinds.forEach((k, i) => {
    const bx = (i % cols) * blockW - ((Math.min(cols, kinds.length) - 1) * blockW) / 2;
    const bz = -Math.floor(i / cols) * blockD;
    for (let v = 0; v < PROP_VARIANTS[k]; v++) {
      const a = getPropAsset(k, v);
      const scale = Math.min(1.6, size / Math.max(a.height, a.radius * 1.6));
      const pos = new THREE.Vector3(bx + ((v % 4) - 1.5) * cell, 0, bz - Math.floor(v / 4) * cell);
      scene.add(instance(a, a.geometry, pos, tintFor(k, v), -0.5, scale));
    }
    const t = rowStats(k).tris;
    addLabel(`${k} ×${PROP_VARIANTS[k]} · ${Math.min(...t)}–${Math.max(...t)}▲`, new THREE.Vector3(bx, 0, bz + 1.4));
    stats[k] = rowStats(k);
  });
  return { target: new THREE.Vector3(0, 0, (-(rows - 1) * blockD) / 2 - 1), dist: Math.max(cols * blockW, rows * blockD) * 0.98, stats };
}

function buildRealGallery(scene: THREE.Scene, only: InstancedPropKind[] | undefined, addLabel: AddLabel) {
  const stats: Record<string, RowStats> = {};
  const bands = GALLERY_BANDS.map((b) => b.filter((k) => !only || only.includes(k))).filter((b) => b.length);
  const bandWidth = (b: InstancedPropKind[]) =>
    Math.max(...b.map((k) => Math.max(...Array.from({ length: PROP_VARIANTS[k] }, (_, v) => getPropAsset(k, v).radius)) * 2.5 * PROP_VARIANTS[k]));
  const widths = bands.map(bandWidth);
  const gap = 12;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (bands.length - 1);
  let x = -total / 2;
  let deepest = 0;
  bands.forEach((band, i) => {
    const cx = x + widths[i] / 2;
    let z = 0;
    for (const k of band) {
      const n = PROP_VARIANTS[k];
      const maxR = Math.max(...Array.from({ length: n }, (_, v) => getPropAsset(k, v).radius));
      const zRow = z - maxR;
      layRow(scene, k, zRow, false, addLabel, 1.25, false, cx);
      const t = rowStats(k).tris;
      addLabel(`${k} ×${n} · ${Math.min(...t)}–${Math.max(...t)}▲`, new THREE.Vector3(cx, 0, zRow + maxR + 0.3));
      z -= maxR * 2 + 2.5;
      stats[k] = rowStats(k);
    }
    deepest = Math.min(deepest, z);
    x += widths[i] + gap;
  });
  const target = new THREE.Vector3(0, 0, deepest * 0.45);
  return { target, dist: Math.max(total * 0.75, -deepest), stats };
}
