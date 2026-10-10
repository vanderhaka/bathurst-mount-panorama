import * as THREE from 'three';
import { installGumDither } from '@/props/trees/gum-lod';
import { treeMaterial } from '@/props/core/materials';
import { createGumAtlas, GUM_ATLAS_GRID } from '@/props/trees/gum-atlas';
import { GUM_SHADING } from '@/props/look';
import { installGumWind, type GumWindUniforms } from '@/props/trees/gum-wind';

export interface GumMaterialOptions { atlasSize: number; barkDetail: boolean; anisotropy?: number }

/** One atlas/material batch for bark, leaves and far crowns, including undergrowth. */
export function createGumMaterials(options: GumMaterialOptions) {
  const atlas = createGumAtlas(options.atlasSize, options.barkDetail);
  for (const t of [atlas.map, atlas.normal, atlas.roughness]) if (t) t.anisotropy = Math.max(1, Math.min(8, options.anisotropy ?? 4));
  const base = treeMaterial(), material = base.clone();
  // Material.clone does not copy callback functions. Retain the existing leaf-only tint.
  material.onBeforeCompile = base.onBeforeCompile; material.customProgramCacheKey = base.customProgramCacheKey;
  material.name = 'props-tree'; material.map = atlas.map; material.normalMap = atlas.normal; material.roughnessMap = atlas.roughness;
  material.normalScale.set(0.45, 0.45); material.flatShading = false; material.roughness = options.barkDetail ? 1 : 0.9;
  material.alphaTest = 0.45; material.alphaToCoverage = true; material.side = THREE.DoubleSide;
  const depthMaterial = new THREE.MeshDepthMaterial({ map: atlas.map, depthPacking: THREE.RGBADepthPacking, alphaTest: material.alphaTest, alphaToCoverage: true, side: THREE.DoubleSide });
  const distanceMaterial = new THREE.MeshDistanceMaterial({ map: atlas.map, alphaTest: material.alphaTest, alphaToCoverage: true, side: THREE.DoubleSide });
  const wind: GumWindUniforms = { time: { value: 0 }, amplitude: { value: 0 } };
  installCrownLighting(material);
  for (const m of [material, depthMaterial, distanceMaterial]) {
    installAtlas(m, atlas.size);
    installGumWind(m, wind);
    installGumDither(m);
  }
  let disposed = false;
  return { material, depthMaterial, distanceMaterial, update: (seconds: number, amplitude: number) => {
    wind.time.value = Number.isFinite(seconds) ? seconds : 0;
    wind.amplitude.value = Math.max(0, Math.min(1, Number.isFinite(amplitude) ? amplitude : 0));
  }, dispose: () => {
    if (disposed) return; disposed = true;
    for (const m of [material, depthMaterial, distanceMaterial]) m.dispose();
    atlas.dispose();
  } };
}

function installAtlas(material: THREE.Material, size: number): void {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  const grid = GUM_ATLAS_GRID.toFixed(1), inset = (1.5 * GUM_ATLAS_GRID / size).toFixed(6);
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    shader.vertexShader = `attribute float treeSurface; varying float vTreeSurface;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vTreeSurface = treeSurface;');
    shader.fragmentShader = `varying float vTreeSurface;\n` + shader.fragmentShader;
    const lookup = `vec2 gumLocalUv = vTreeSurface < 1.5 ? fract(vMapUv) : clamp(vMapUv, 0.0, 1.0);
      vec2 gumTile = vec2(mod(vTreeSurface, ${grid}), floor(vTreeSurface / ${grid}));
      vec2 gumAtlasUv = (gumTile + mix(vec2(${inset}), vec2(1.0 - ${inset}), gumLocalUv)) / ${grid};`;
    // Coarse atlas mips may average bark with neighbouring leaf alpha; wood stays solid.
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', lookup + '\n' + THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'gumAtlasUv') + '\nif (vTreeSurface < 1.5) diffuseColor.a = 1.0;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', THREE.ShaderChunk.roughnessmap_fragment.replaceAll('vRoughnessMapUv', 'gumAtlasUv'));
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv', 'gumAtlasUv'));
  };
  material.customProgramCacheKey = function () { return `${key.call(this)}:gum-atlas-v1:${size}`; };
  material.needsUpdate = true;
}

/** A single rounded lighting field across all intersecting near/far leaf cards. */
function installCrownLighting(material: THREE.Material): void {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    shader.vertexShader = 'varying vec3 vGumCrown; varying float vGumUp;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <normal_vertex>', `#include <normal_vertex>
      vGumCrown = normal;
      #ifdef USE_BATCHING
        vGumCrown = mat3(batchingMatrix) * vGumCrown / length(batchingMatrix[0].xyz);
      #endif
      #ifdef USE_INSTANCING
        vGumCrown = mat3(instanceMatrix) * vGumCrown / length(instanceMatrix[0].xyz);
      #endif
      vGumUp = vGumCrown.y;
      vGumCrown = mat3(modelViewMatrix) * vGumCrown / length(modelViewMatrix[0].xyz);`);
    shader.fragmentShader = 'varying vec3 vGumCrown; varying float vGumUp;\n' + shader.fragmentShader;
    // Intersecting opaque leaf cores must not cast stripes on neighbouring cards.
    // The same cutout geometry still casts woodland shadows; wood receives them.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>',
      THREE.ShaderChunk.lights_fragment_begin.replaceAll('receiveShadow', '(receiveShadow && vTreeSurface < 1.5)'));
    // Crown-space shading: dark underside, lit top and centre occlusion (vGumCrown is the card's offset from the crown centre).
    const s = GUM_SHADING, f = (n: number) => n.toFixed(3);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vTreeSurface >= 1.5) {
        float gumTop = smoothstep(-0.55, 0.85, vGumUp);
        #if NUM_DIR_LIGHTS > 0
          gumTop = 0.55 * gumTop + 0.45 * smoothstep(-0.5, 0.8, dot(normalize(vGumCrown), directionalLights[0].direction));
        #endif
        float gumAo = mix(${f(1 - s.ao)}, 1.0, smoothstep(${f(s.aoStart)}, ${f(s.aoEnd)}, length(vGumCrown)));
        diffuseColor.rgb *= ${f(s.gain)} * mix(${f(1 - s.under)}, ${f(1 + s.topLift)}, gumTop) * gumAo;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vTreeSurface >= 1.5) {
        vec2 gumRadial = vGumCrown.xy;
        normal = normalize(vec3(gumRadial, sqrt(max(0.06, 1.0 - dot(gumRadial, gumRadial)))));
      }`);
  };
  material.customProgramCacheKey = function () { return `${key.call(this)}:gum-rounded-light-v3`; };
  material.needsUpdate = true;
}
