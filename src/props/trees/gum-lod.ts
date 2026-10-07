import type * as THREE from 'three';

/** Thirty metre blend centred on the scaled LOD threshold. */
export function gumLodWeights(distance: number, threshold: number, width = 30): { near: number; far: number } {
  const far = Math.max(0, Math.min(1, (distance - threshold + width * 0.5) / Math.max(0.001, width)));
  return { near: 1 - far, far };
}

/** Positive alpha selects the near fraction; negative alpha selects its complementary far fraction. */
export function gumDitherKeeps(signedAlpha: number, noise: number): boolean {
  return signedAlpha < 0 ? noise >= 1 + signedAlpha : noise < signedAlpha;
}

/** BatchedMesh colours retain RGB. Vector4.w carries signed LOD coverage, including shadows. */
export function installGumDither(material: THREE.Material): void {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey;
  material.onBeforeCompile = function (shader, renderer) {
    before.call(this, shader, renderer);
    shader.vertexShader = 'varying float vGumLod;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <batching_vertex>', `#include <batching_vertex>
      vGumLod = 1.0;
      #ifdef USE_BATCHING_COLOR
        vGumLod = getBatchingColor(getIndirectIndex(gl_DrawID)).a;
      #endif`);
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR_ALPHA\n vColor.a = 1.0;\n#endif');
    shader.fragmentShader = 'varying float vGumLod;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      float gumNoise = fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.754877666, 0.569840296)));
      if (vGumLod < 0.0) {
        if (gumNoise < 1.0 + vGumLod) discard;
      } else if (gumNoise >= vGumLod) discard;
      #include <alphatest_fragment>`);
  };
  material.customProgramCacheKey = function () { return `${key.call(this)}:gum-dither-v1`; };
  material.needsUpdate = true;
}
