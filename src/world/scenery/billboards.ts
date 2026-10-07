import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACKSIDE } from '@/art/palette';
import { FONT_STACK as HUD_FONT_STACK } from '@/car/models/livery-canvas';
import { SPONSORS } from '@/art/sponsors';

const COLS = 4, ROWS = 2, CELL_W = 512, CELL_H = 128;

let cachedAtlas: THREE.CanvasTexture | null = null;

/** Number of sponsors in the atlas. */
export const SPONSOR_COUNT = SPONSORS.length;

/**
 * Track sections (lap distance, m) where a corner-named brand belongs: a fan expects
 * "Skyline Radio" at Skyline, not at Hell Corner. Brands not listed go anywhere.
 */
const HOME: Record<string, Array<[number, number]>> = {
  SKYLINE: [[3000, 3700]],
  CONROD: [[4000, 5400]],
  ESSES: [[3300, 3900]],
  'HELL CORNER': [[150, 750]],
};
const GENERIC = SPONSORS.map((sp, k) => (HOME[sp.name] ? -1 : k)).filter((k) => k >= 0);

/** Sponsor index for a sign at lap distance s; `pick` varies the choice between signs. */
export function sponsorAt(s: number, pick: number): number {
  const local = SPONSORS.map((sp, k) => (HOME[sp.name]?.some(([a, b]) => s >= a && s <= b) ? k : -1)).filter((k) => k >= 0);
  const pool = local.length && pick % 3 !== 2 ? local : GENERIC;
  return pool[((pick % pool.length) + pool.length) % pool.length];
}

/** Atlas UV rectangle of sponsor `cell`: u0..u0 + 1/4 across, v1 - 1/2..v1 down. */
export function sponsorCell(cell: number): { u0: number; u1: number; v0: number; v1: number } {
  const k = ((cell % SPONSORS.length) + SPONSORS.length) % SPONSORS.length;
  const u0 = (k % COLS) / COLS, v1 = 1 - Math.floor(k / COLS) / ROWS;
  return { u0, u1: u0 + 1 / COLS, v0: v1 - 1 / ROWS, v1 };
}

/** The shared sponsor atlas texture (billboards and wall signs). */
export function sponsorAtlas(): THREE.CanvasTexture {
  if (!cachedAtlas) cachedAtlas = atlas();
  return cachedAtlas;
}

function atlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = CELL_W * COLS;
  c.height = CELL_H * ROWS;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  SPONSORS.forEach((sp, i) => {
    const x = (i % COLS) * CELL_W, y = Math.floor(i / COLS) * CELL_H;
    ctx.fillStyle = sp.bg;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.fillStyle = sp.accent;
    ctx.fillRect(x, y + CELL_H - 14, CELL_W, 6);
    ctx.fillStyle = sp.fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `800 64px ${HUD_FONT_STACK}`;
    const nameW = ctx.measureText(sp.name).width;
    ctx.font = `600 34px ${HUD_FONT_STACK}`;
    const tagW = ctx.measureText(sp.tag).width;
    const total = nameW + 18 + tagW;
    const sx = x + Math.max(16, (CELL_W - total) / 2);
    ctx.font = `800 64px ${HUD_FONT_STACK}`;
    ctx.fillText(sp.name, sx, y + CELL_H * 0.47, CELL_W - 40);
    ctx.font = `600 34px ${HUD_FONT_STACK}`;
    ctx.fillStyle = sp.accent;
    ctx.fillText(sp.tag, sx + nameW + 18, y + CELL_H * 0.5, Math.max(40, CELL_W - (sx - x) - nameW - 30));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export interface BillboardPlacement { x: number; y: number; z: number; yaw: number; /** Lap distance (picks a local sponsor). */ s: number }

/**
 * Trackside hoardings: 6 m × 1.5 m panels on two posts, each showing one of the
 * fictional sponsors. All panels share one atlas texture and one draw call.
 */
export function buildBillboards(places: BillboardPlacement[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'billboards';
  if (!places.length) return group;
  const faces: THREE.BufferGeometry[] = [];
  const frames: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  places.forEach((p, k) => {
    m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), one);
    const { u0, v1 } = sponsorCell(sponsorAt(p.s, k));
    const face = new THREE.PlaneGeometry(6, 1.5);
    const uv = face.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / COLS, v1 - (1 - uv.getY(i)) / ROWS);
    face.translate(0, 2.05, 0.06).applyMatrix4(m);
    faces.push(face);
    const back = new THREE.BoxGeometry(6.1, 1.6, 0.1).translate(0, 2.05, 0);
    const postL = new THREE.BoxGeometry(0.12, 2.9, 0.12).translate(-2.6, 1.45, -0.08);
    const postR = new THREE.BoxGeometry(0.12, 2.9, 0.12).translate(2.6, 1.45, -0.08);
    for (const g of [back, postL, postR]) {
      g.deleteAttribute('uv');
      frames.push(g.applyMatrix4(m));
    }
  });
  const faceMesh = new THREE.Mesh(mergeGeometries(faces), new THREE.MeshStandardMaterial({ map: sponsorAtlas(), roughness: 0.75 }));
  faceMesh.castShadow = true;
  faceMesh.receiveShadow = true;
  const frameMesh = new THREE.Mesh(mergeGeometries(frames), new THREE.MeshStandardMaterial({ color: TRACKSIDE.fencePost, roughness: 0.6, metalness: 0.3, flatShading: true }));
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  group.add(faceMesh, frameMesh);
  return group;
}
