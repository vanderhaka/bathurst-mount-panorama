import * as THREE from 'three';
import { createRng } from '@/props/core/rng';
import type { QualityPreset } from '@/render/renderer';

export type TowerStyle = 'glass' | 'concrete' | 'balcony';
export interface TowerSpec { x: number; z: number; width: number; depth: number; height: number; yaw: number; style: TowerStyle; seed: number }

// Facade tile: 4 floors (3.2 m) by 4 bays (3 m). UVs are in tile repeats, derived from metres,
// so windows keep their real size whatever the tower dimensions.
const FLOOR = 3.2, BAY = 3, TILE_W = BAY * 4, TILE_H = FLOOR * 4;
const SPIRE_FROM = 280, CROWN_FROM = 60;
const STYLES: readonly TowerStyle[] = ['glass', 'concrete', 'balcony'];
const SURFACE: Record<TowerStyle, { roughness: number; metalness: number }> = {
  glass: { roughness: 0.25, metalness: 0.35 },
  concrete: { roughness: 0.85, metalness: 0 },
  balcony: { roughness: 0.6, metalness: 0 },
};

/** Paints one 4 x 4 cell facade tile with the 2D canvas API. */
function paintFacade(style: TowerStyle, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cell = size / 4;
  ctx.fillStyle = style === 'concrete' ? '#e2ddd0' : style === 'glass' ? '#4d6676' : '#33505d';
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const x = col * cell, y = row * cell;
    if (style === 'glass') {
      const band = ctx.createLinearGradient(0, y, 0, y + cell);
      band.addColorStop(0, '#9bb8c9'); band.addColorStop(1, '#5a7b8e');
      ctx.fillStyle = band; ctx.fillRect(x, y, cell, cell * 0.8);
      ctx.fillStyle = '#34464f'; ctx.fillRect(x, y + cell * 0.8, cell, cell * 0.2);
      ctx.fillStyle = '#26333a'; ctx.fillRect(x, y, Math.max(1, cell * 0.04), cell * 0.8);
    } else if (style === 'concrete') {
      ctx.fillStyle = '#2b343c'; ctx.fillRect(x + cell * 0.2, y + cell * 0.22, cell * 0.6, cell * 0.5);
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x + cell * 0.16, y + cell * 0.72, cell * 0.68, cell * 0.06);
    } else {
      ctx.fillStyle = '#7e98a6'; ctx.fillRect(x + cell * 0.05, y + cell * 0.08, cell * 0.9, cell * 0.62);
      ctx.fillStyle = '#f2f0ea'; ctx.fillRect(x, y + cell * 0.78, cell, cell * 0.22);
      ctx.fillStyle = '#c9ccc8'; ctx.fillRect(x, y + cell * 0.7, cell, cell * 0.04);
    }
  }
  return canvas;
}

/** Plain triangle soup with position, normal, uv and a per-vertex lightness multiplier. */
class Soup {
  /** Placement applied to every quad added (set per tower). */
  m = new THREE.Matrix4();
  private pos: number[] = []; private nor: number[] = []; private uv: number[] = []; private col: number[] = [];
  get empty(): boolean { return this.pos.length === 0; }

  /** Quad a-b-c-d, counter-clockwise from the front; uv pairs follow the same order. */
  quad(corners: THREE.Vector3[], uv: number[], k: number): void {
    const p = corners.map(c => c.clone().applyMatrix4(this.m));
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0])).normalize();
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(p[i].x, p[i].y, p[i].z); this.nor.push(n.x, n.y, n.z);
      this.uv.push(uv[i * 2], uv[i * 2 + 1]); this.col.push(k, k, k);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Four facade walls (UV in metres) between y0 and y1, plus a roof cap in the roof soup. */
function addBox(walls: Soup, roof: Soup, w: number, d: number, y0: number, y1: number, k: number, uOff: number): void {
  for (let s = 0; s < 4; s++) {
    const a = (s * Math.PI) / 2, n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const t = new THREE.Vector3(n.z, 0, -n.x), half = s % 2 === 0 ? w / 2 : d / 2, out = s % 2 === 0 ? d / 2 : w / 2;
    const c = n.clone().multiplyScalar(out), bl = c.clone().addScaledVector(t, -half), br = c.clone().addScaledVector(t, half);
    const u0 = uOff + (s * 7.3) / TILE_W, u1 = u0 + (2 * half) / TILE_W, v0 = y0 / TILE_H, v1 = y1 / TILE_H;
    walls.quad([bl.clone().setY(y0), br.clone().setY(y0), br.clone().setY(y1), bl.clone().setY(y1)], [u0, v0, u1, v0, u1, v1, u0, v1], k);
  }
  const V = (x: number, z: number) => new THREE.Vector3(x, y1, z);
  roof.quad([V(-w / 2, -d / 2), V(-w / 2, d / 2), V(w / 2, d / 2), V(w / 2, -d / 2)], new Array<number>(8).fill(0), k);
}

/** Four-sided tapered spire (3 m base, 0.4 m top) in the roof material. */
function addSpire(roof: Soup, y0: number, y1: number, k: number): void {
  const c = (r: number, y: number, i: number) => new THREE.Vector3(r * Math.sign(Math.cos(i * Math.PI / 2 + Math.PI / 4)), y, r * Math.sign(Math.sin(i * Math.PI / 2 + Math.PI / 4)));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    roof.quad([c(1.5, y0, j), c(1.5, y0, i), c(0.2, y1, i), c(0.2, y1, j)], new Array<number>(8).fill(0), k);
  }
}

function addTower(walls: Soup, roof: Soup, spec: TowerSpec): void {
  const rng = createRng(spec.seed * 31 + 5), k = 1 + (rng() * 2 - 1) * 0.06, uOff = rng(), h = spec.height;
  const spire = h > SPIRE_FROM, crown = h > CROWN_FROM ? 4 + rng() * 4 : 0;
  const bodyTop = spire ? h * 0.78 : h - crown;
  walls.m.makeRotationY(spec.yaw).setPosition(spec.x, 0, spec.z); roof.m.copy(walls.m);
  addBox(walls, roof, spec.width, spec.depth, 0, bodyTop, k, uOff);
  if (crown > 0) addBox(walls, roof, spec.width * 0.7, spec.depth * 0.7, bodyTop, bodyTop + crown, k, uOff);
  if (spire) addSpire(roof, bodyTop + crown, h, k);
}

/**
 * Merged high-rise blocks with generated window facades; at most 5 draw calls.
 * Shadows: no tower casts one (merged meshes cannot be culled per tower, and the far skyline should
 * not cost shadow passes); all of them receive. Facade tile size follows the preset (256 low, 512 else).
 * Dispose follows adelaide-scenery: one idempotent closure frees geometry, materials and textures.
 */
export function buildTowers(towers: readonly TowerSpec[], quality: QualityPreset): THREE.Group {
  const group = new THREE.Group(); group.name = 'gold-coast-towers';
  const roof = new Soup(), walls = { glass: new Soup(), concrete: new Soup(), balcony: new Soup() };
  for (const spec of towers) addTower(walls[spec.style], roof, spec);
  const size = quality === 'low' ? 256 : 512;
  const owned: Array<{ dispose(): void }> = [];
  const mesh = (name: string, soup: Soup, material: THREE.Material): void => {
    const geometry = soup.geometry();
    const m = new THREE.Mesh(geometry, material); m.name = name; m.castShadow = false; m.receiveShadow = true;
    owned.push(geometry, material); group.add(m);
  };
  for (const style of STYLES) {
    if (walls[style].empty) continue;
    const map = new THREE.CanvasTexture(paintFacade(style, size));
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    owned.push(map);
    mesh(`gold-coast-towers-${style}`, walls[style], new THREE.MeshStandardMaterial({ map, vertexColors: true, ...SURFACE[style] }));
  }
  if (!roof.empty) mesh('gold-coast-towers-roof', roof, new THREE.MeshStandardMaterial({ color: 0x3c3f44, roughness: 0.9, metalness: 0, vertexColors: true }));
  let disposed = false;
  group.userData.dispose = (): void => {
    if (disposed) return; disposed = true;
    owned.forEach(o => o.dispose()); group.clear();
  };
  return group;
}
