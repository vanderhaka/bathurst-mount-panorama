import * as THREE from 'three';
import { generateBarkTile } from '@/props/trees/gum-bark';
import { generateLeafTile } from '@/props/trees/gum-leaves';

export const GUM_ATLAS_GRID = 4;
/** Tiles 0/1: smooth/box bark; 2: leaves; 3–10: ragged oval crown impostors. */
export function createGumAtlas(requestedSize: number, barkDetail: boolean) {
  const size = 2 ** Math.floor(Math.log2(Math.max(64, Math.min(1024, requestedSize))));
  const tileSize = size / GUM_ATLAS_GRID, data = new Uint8Array(size * size * 4);
  const normals = new Uint8Array(data.length), roughness = new Uint8Array(data.length);
  for (let tile = 0; tile < 16; tile++) {
    const bark = tile < 2 ? generateBarkTile(tileSize, tile === 0 ? 'smooth' : 'box') : null;
    const leaves = bark ? null : generateLeafTile(tileSize, 71 + (tile === 2 ? 0 : (tile - 3) % 8) * 97, tile !== 2);
    for (let y = 0; y < tileSize; y++) for (let x = 0; x < tileSize; x++) {
      const source = (y * tileSize + x) * 4;
      const target = (((Math.floor(tile / 4) * tileSize) + y) * size + (tile % 4) * tileSize + x) * 4;
      for (let c = 0; c < 4; c++) {
        data[target + c] = bark ? (barkDetail ? bark.albedo[source + c] : 255) : leaves![source + c];
        normals[target + c] = bark ? bark.normal[source + c] : [128, 128, 255, 255][c];
        roughness[target + c] = bark ? bark.roughness[source + c] : (c === 3 ? 255 : 235);
      }
    }
  }
  const make = (pixels: Uint8Array, colour: boolean) => {
    const t = new THREE.DataTexture(pixels, size, size);
    t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const map = make(data, true), normal = barkDetail ? make(normals, false) : null, rough = barkDetail ? make(roughness, false) : null;
  let disposed = false;
  return { map, normal, roughness: rough, size, dispose: () => {
    if (disposed) return; disposed = true;
    for (const t of [map, normal, rough]) t?.dispose();
  } };
}
