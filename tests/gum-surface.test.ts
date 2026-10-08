import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGumAtlas, GUM_ATLAS_GRID } from '@/props/trees/gum-atlas';
import { createGumMaterials } from '@/props/trees/gum-materials';
import { crownCards, generateLeafTile } from '@/props/trees/gum-leaves';
import { generateBarkTile } from '@/props/trees/gum-bark';
import { gumWindOffset, GUM_WIND_PADDING, installGumWind, padGumBounds } from '@/props/trees/gum-wind';
import { buildFallenBark, buildGumShrub, planUnderTreeDetails } from '@/props/trees/gum-undergrowth';
import { buildEucalyptus, buildYoungEucalyptus, TREE_VARIANTS } from '@/props/trees';

const tris = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3;
const crownBounds = (g: THREE.BufferGeometry) => {
  const p = g.getAttribute('position'), surface = g.getAttribute('treeSurface');
  const bounds = new THREE.Box3(), point = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) if (surface.getX(i) >= 2) bounds.expandByPoint(point.fromBufferAttribute(p, i));
  return bounds;
};

function largestComponent(data: Uint8Array, size: number): [number, number] {
  const seen = new Uint8Array(size * size);
  let largest = 0, total = 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || data[i * 4 + 3] < 115) continue;
    const queue = [i]; seen[i] = 1;
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q], x = j % size;
      const neighbours = [j - size, j + size, x ? j - 1 : -1, x < size - 1 ? j + 1 : -1];
      for (const n of neighbours) if (n >= 0 && n < seen.length && !seen[n] && data[n * 4 + 3] >= 115) { seen[n] = 1; queue.push(n); }
    }
    total += queue.length; largest = Math.max(largest, queue.length);
  }
  return [largest, total];
}

describe('gum surface assets', () => {
  it('draws reproducible oval foliage of connected leaf clumps with gaps and a transparent ragged rim', () => {
    for (const seed of [3, 5, 11, 19]) {
      const data = generateLeafTile(128, seed, true);
      expect(data).toEqual(generateLeafTile(128, seed, true));
      const [largest, total] = largestComponent(data, 128);
      // Clumped leaf sprays: one dominant connected mass with real gaps between clumps (intentionally open, not a solid blob).
      expect(total).toBeGreaterThan(128 * 128 * 0.2);
      expect(largest / total).toBeGreaterThan(0.9);
      let gaps = 0;
      for (let y = 32; y < 96; y++) for (let x = 32; x < 96; x++) if (data[(y * 128 + x) * 4 + 3] < 115) gaps++;
      expect(gaps).toBeGreaterThan(64 * 64 * 0.05);
      expect(data[3]).toBe(0);
      expect([...data].filter((v, i) => i % 4 === 3 && v > 0 && v < 255).length).toBeGreaterThan(20);
    }
  });

  it('keeps mature and young crowns the same oval envelope at both LODs within budgets', () => {
    for (const [build, count] of [[buildEucalyptus, TREE_VARIANTS.eucalyptus], [buildYoungEucalyptus, TREE_VARIANTS.eucalyptusYoung]] as const) {
      for (let v = 0; v < count; v++) {
        const tree = build(v);
        expect(tris(tree.near)).toBeLessThanOrEqual(450);
        expect(tris(tree.far)).toBeLessThanOrEqual(60);
        const near = crownBounds(tree.near), far = crownBounds(tree.far);
        const size = near.getSize(new THREE.Vector3());
        expect(far.getCenter(new THREE.Vector3()).distanceTo(near.getCenter(new THREE.Vector3()))).toBeLessThan(0.02);
        expect(far.getSize(new THREE.Vector3()).distanceTo(size) / size.length()).toBeLessThan(0.08);
        expect(size.x / size.y).toBeGreaterThan(0.45);
        expect(size.x / size.y).toBeLessThan(3);
        for (const geo of [tree.near, tree.far]) {
          const n = geo.getAttribute('position').count;
          for (const name of ['normal', 'color', 'uv', 'treeSurface', 'treeWind']) {
            expect(geo.getAttribute(name).count).toBe(n);
            expect(Array.from(geo.getAttribute(name).array).every(Number.isFinite)).toBe(true);
          }
          geo.dispose();
        }
      }
    }
  });

  it('gives every wood vertex a unit normal, including the two-sided dead fins of far trees', () => {
    // A zero normal becomes NaN in the shader (normalize(0)); the HDR post chain spreads it as black specks.
    const assets = [...Array.from({ length: TREE_VARIANTS.eucalyptus }, (_, v) => buildEucalyptus(v)),
      ...Array.from({ length: TREE_VARIANTS.eucalyptusYoung }, (_, v) => buildYoungEucalyptus(v))];
    for (const geo of assets.flatMap(tree => [tree.near, tree.far])) {
      const n = geo.getAttribute('normal'), surface = geo.getAttribute('treeSurface'), normal = new THREE.Vector3();
      for (let i = 0; i < n.count; i++) {
        if (surface.getX(i) >= 2) continue; // Crown cards carry deliberately unnormalised radial fields.
        expect(normal.fromBufferAttribute(n, i).length()).toBeCloseTo(1, 4);
      }
      geo.dispose();
    }
  });

  it('uses one radial field instead of a card-facing lighting bias', () => {
    const centre = new THREE.Vector3(2, 8, -1), radii = new THREE.Vector3(3, 2, 2.5);
    const card = crownCards({ centre, radii });
    const p = card.getAttribute('position'), n = card.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const radial = new THREE.Vector3().fromBufferAttribute(p, i).sub(centre).divide(radii);
      expect(new THREE.Vector3().fromBufferAttribute(n, i).distanceTo(radial)).toBeLessThan(1e-5);
    }
    card.dispose();
  });

  it('keeps bark maps seamless, opaque and distinct for smooth and box gums', () => {
    const smooth = generateBarkTile(64, 'smooth'), box = generateBarkTile(64, 'box');
    expect(smooth.albedo).not.toEqual(box.albedo);
    expect(box.roughness[1]).toBeGreaterThan(smooth.roughness[1]);
    for (const maps of [smooth, box]) for (const data of [maps.albedo, maps.normal, maps.roughness]) {
      for (let i = 0; i < 64; i++) {
        expect(data.slice(i * 4, i * 4 + 4)).toEqual(data.slice(((63 * 64) + i) * 4, ((63 * 64) + i) * 4 + 4));
        expect(data.slice(i * 64 * 4, i * 64 * 4 + 4)).toEqual(data.slice((i * 64 + 63) * 4, (i * 64 + 63) * 4 + 4));
      }
      expect(data.filter((v, i) => i % 4 === 3 && v !== 255).length).toBe(0);
    }
  });

  it('owns shared mipmapped atlas textures within tier ceilings', () => {
    const atlas = createGumAtlas(256, true);
    expect(GUM_ATLAS_GRID).toBe(4);
    for (const texture of [atlas.map, atlas.normal, atlas.roughness]) {
      expect(texture).not.toBeNull();
      expect(texture!.generateMipmaps).toBe(true);
      expect((texture!.image as unknown as { width: number }).width).toBe(256);
    }
    expect(atlas.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(atlas.normal!.colorSpace).toBe(THREE.NoColorSpace);
    let disposed = 0;
    for (const t of [atlas.map, atlas.normal, atlas.roughness]) t!.addEventListener('dispose', () => disposed++);
    atlas.dispose(); atlas.dispose(); expect(disposed).toBe(3);
    const cheap = createGumAtlas(256, false);
    expect(cheap.normal).toBeNull(); expect(cheap.roughness).toBeNull(); cheap.dispose();
  });

  it('anchors roots, de-correlates trees and bounds every wind displacement', () => {
    const root = new THREE.Vector3(), canopy = new THREE.Vector3(1, 18, 2);
    expect(gumWindOffset(root, new THREE.Vector2(0, 0), 3, 1).length()).toBe(0);
    const a = gumWindOffset(canopy, new THREE.Vector2(1, 1), 3, 1);
    const b = gumWindOffset(canopy, new THREE.Vector2(1, 1), 3, 1, new THREE.Vector2(120, 350));
    expect(a.distanceTo(b)).toBeGreaterThan(0.03);
    for (let t = 0; t < 100; t += 0.7) expect(gumWindOffset(canopy, new THREE.Vector2(1, 1), t, 1).length()).toBeLessThan(GUM_WIND_PADDING);
    expect(gumWindOffset(canopy, new THREE.Vector2(1, 1), 3, 0).length()).toBe(0);
  });

  it('chains earlier shader hooks/cache keys and shares alpha/wind with shadow materials', () => {
    const base = new THREE.MeshStandardMaterial();
    base.onBeforeCompile = (s) => { s.vertexShader = '// original\n' + s.vertexShader; };
    base.customProgramCacheKey = () => 'original-key';
    const wind = { time: { value: 0 }, amplitude: { value: 0.2 } };
    installGumWind(base, wind);
    const shader = () => ({ vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>', uniforms: {} }) as THREE.WebGLProgramParametersWithUniforms;
    const first = shader(); base.onBeforeCompile(first, {} as THREE.WebGLRenderer);
    expect(first.vertexShader).toContain('// original'); expect(base.customProgramCacheKey()).toContain('original-key');
    const bundle = createGumMaterials({ atlasSize: 256, barkDetail: true });
    bundle.update(12, 0.3);
    for (const [m, source] of [[bundle.material, THREE.ShaderLib.standard], [bundle.depthMaterial, THREE.ShaderLib.depth], [bundle.distanceMaterial, THREE.ShaderLib.distance]] as const) {
      expect(m.alphaTest).toBeGreaterThan(0); expect(m.alphaToCoverage).toBe(true);
      const s = { vertexShader: source.vertexShader, fragmentShader: source.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(s, {} as THREE.WebGLRenderer);
      expect(s.vertexShader).toContain('gumWindOffset');
      expect(s.vertexShader).toContain('vTreeSurface = treeSurface');
      expect(s.fragmentShader).toContain('gumAtlasUv');
      expect(s.fragmentShader).toContain('if (vTreeSurface < 1.5) diffuseColor.a = 1.0');
      expect(s.uniforms.gumTime.value).toBe(12); expect(s.uniforms.gumAmplitude.value).toBe(0.3);
    }
    expect(bundle.material.color.getHex()).toBe(0xffffff);
    expect(bundle.material.transparent).toBe(false); expect(bundle.material.depthWrite).toBe(true);
    expect(bundle.material.map).toBe(bundle.depthMaterial.map);
    let disposed = 0;
    bundle.material.addEventListener('dispose', () => disposed++);
    bundle.dispose(); bundle.dispose(); expect(disposed).toBe(1); base.dispose();
  });

  it('batches trees and undergrowth without losing wind-culling margins or surface attributes', () => {
    const tree = buildEucalyptus(0), young = buildYoungEucalyptus(0), shrub = buildGumShrub(0), bark = buildFallenBark(0);
    const geometries = [tree.near, tree.far, young.near, young.far, shrub.near, shrub.far, bark];
    const material = new THREE.MeshStandardMaterial(), vertices = geometries.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
    const batch = new THREE.BatchedMesh(geometries.length, vertices, 0, material);
    for (const g of geometries) {
      g.computeBoundingBox(); const before = g.boundingBox!.clone();
      padGumBounds(g); const id = batch.addGeometry(g), bound = new THREE.Box3();
      batch.getBoundingBoxAt(id, bound);
      expect(bound).toEqual(g.boundingBox);
      expect(bound.min.x).toBeCloseTo(before.min.x - (g === bark ? 0 : GUM_WIND_PADDING));
      for (const name of ['uv', 'treeSurface', 'treeWind']) expect(batch.geometry.getAttribute(name).itemSize).toBe(g.getAttribute(name).itemSize);
      batch.addInstance(id);
    }
    batch.computeBoundingSphere(); expect(batch.boundingSphere!.radius).toBeGreaterThan(0);
    batch.dispose(); material.dispose(); for (const g of geometries) g.dispose();
  });

  it('keeps shrubs and curled fallen bark in the shared tree vertex schema', () => {
    for (let v = 0; v < 6; v++) {
      const shrub = buildGumShrub(v), bark = buildFallenBark(v);
      expect(tris(shrub.near)).toBeLessThanOrEqual(300); expect(tris(shrub.far)).toBeLessThanOrEqual(60);
      expect(tris(bark)).toBeLessThanOrEqual(60);
      bark.computeBoundingBox(); expect(bark.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
      expect(bark.boundingBox!.max.y).toBeLessThan(0.25);
      for (const g of [shrub.near, shrub.far, bark]) {
        for (const name of ['uv', 'treeSurface', 'treeWind']) expect(g.getAttribute(name).count).toBe(g.getAttribute('position').count);
        if (g === bark) expect(g.getAttribute('treeWind').array.every((n) => n === 0)).toBe(true);
        g.dispose();
      }
    }
  });

  it('plans sparse deterministic under-tree details inside the crown footprint', () => {
    const placements = planUnderTreeDetails(12, 7);
    expect(placements).toEqual(planUnderTreeDetails(12, 7));
    expect(placements.length).toBeGreaterThan(3); expect(placements.length).toBeLessThanOrEqual(9);
    expect(placements.some((p) => p.kind === 'fallenBark')).toBe(true);
    expect(placements.some((p) => p.kind === 'shrub')).toBe(true);
    for (const p of placements) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0.7);
      expect(Math.hypot(p.x, p.z)).toBeLessThan(7 * 0.8);
      expect(p.scale).toBeGreaterThan(0.3); expect(p.scale).toBeLessThanOrEqual(1.1);
    }
  });
});
