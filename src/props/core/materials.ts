import * as THREE from 'three';
import { vertexColourMaterial } from '@/art/materials';
import { PROPS_LOOK } from '@/props/look';

// Shared white-based materials for props. Albedo is in vertex colours.

const cache = new Map<string, THREE.Material>();

/** Opaque vertex-coloured material for most props. */
export function propMaterial(): THREE.MeshStandardMaterial {
  return vertexColourMaterial({ roughness: PROPS_LOOK.shading.roughness, flat: PROPS_LOOK.shading.flat });
}

/** Boulders: smooth-shaded, rough stone. */
export function rockMaterial(): THREE.MeshStandardMaterial {
  return vertexColourMaterial({ roughness: PROPS_LOOK.rock.roughness, flat: false });
}

/** Foliage / trees (slightly rougher). */
export function foliageMaterial(): THREE.MeshStandardMaterial {
  return vertexColourMaterial({ roughness: PROPS_LOOK.shading.foliageRoughness, flat: PROPS_LOOK.shading.flat });
}

// Leaf-only hue tint: green ("leafy") vertex colours take the full instance colour;
// neutral or brown ones (bark, dead wood) take only its brightness, so a warm or
// blue tint varies the crown but leaves the pale gum trunks white-grey.
const leafTintGlsl = (hue: number) => /* glsl */ `
vec3 propsLeafTint( vec3 base, vec3 tintColour ) {
  float leaf = clamp( ( base.g - max( base.r, base.b ) ) * 40.0, 0.0, 1.0 );
  float luma = dot( tintColour, vec3( 0.2126, 0.7152, 0.0722 ) );
  return mix( vec3( luma ), tintColour, leaf * ${hue.toFixed(3)} );
}`;

/**
 * Gum trees: like foliageMaterial, but the per-instance colour (InstancedMesh or
 * BatchedMesh) tints the hue of the leaves only; trunks take its brightness.
 */
export function treeMaterial(): THREE.MeshStandardMaterial {
  const { foliageRoughness: roughness, flat, treeTintHue } = PROPS_LOOK.shading;
  const hue = Math.min(1, Math.max(0, treeTintHue));
  const key = `tree:${roughness}:${flat}:${hue}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness: 0, flatShading: flat });
  m.name = 'props-tree';
  m.onBeforeCompile = (shader) => {
    const chunk = THREE.ShaderChunk.color_vertex
      .replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= propsLeafTint( vColor.rgb, instanceColor.rgb );')
      .replace('vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );', 'vColor.rgb *= propsLeafTint( vColor.rgb, getBatchingColor( getIndirectIndex( gl_DrawID ) ).rgb );');
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', `#include <color_pars_vertex>\n${leafTintGlsl(hue)}`)
      // Includes are expanded after onBeforeCompile, so inline the patched chunk.
      .replace('#include <color_vertex>', chunk);
  };
  m.customProgramCacheKey = () => `props-tree-leaf-tint:${hue}`;
  cache.set(key, m);
  return m;
}

/**
 * Vertex-coloured material whose instance colour only applies where the
 * geometry's `tintMask` attribute is 1 (fixed parts keep their real colour).
 * Without instance colours it renders exactly like propMaterial.
 */
export function tintMaterial(): THREE.MeshStandardMaterial {
  const { roughness, flat } = PROPS_LOOK.shading;
  const key = `tint:${roughness}:${flat}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness, metalness: 0, flatShading: flat });
  m.name = 'props-tint-mask';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )\nattribute float tintMask;\n#endif')
      // Includes are expanded after onBeforeCompile, so inline the patched chunk.
      // InstancedMesh and BatchedMesh (the scenery instancer) both tint only the masked parts.
      .replace(
      '#include <color_vertex>',
      THREE.ShaderChunk.color_vertex
        .replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tintMask );')
        .replace('vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );', 'vColor.rgb *= mix( vec3( 1.0 ), getBatchingColor( getIndirectIndex( gl_DrawID ) ).rgb, tintMask );'),
    );
  };
  m.customProgramCacheKey = () => 'props-tint-mask';
  cache.set(key, m);
  return m;
}

/** Glazing for structures: tinted, smooth and partly metallic so it picks up the sky. */
export function glassMaterial(): THREE.MeshStandardMaterial {
  const r = PROPS_LOOK.shading.glassRoughness;
  const key = `glass:${r}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: r, metalness: 0.15, flatShading: true });
  m.name = 'props-glass';
  cache.set(key, m);
  return m;
}

/** Painted / galvanised steel. */
export function metalMaterial(): THREE.MeshStandardMaterial {
  return vertexColourMaterial({ roughness: PROPS_LOOK.shading.metalRoughness, metalness: 0.45, flat: PROPS_LOOK.shading.flat });
}

/** Self-lit parts (screens, start lights, timing digits). Colour from vertex colours. */
export function emissiveMaterial(): THREE.MeshBasicMaterial {
  const key = 'emissive';
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
  m.name = 'props-emissive';
  cache.set(key, m);
  return m;
}
