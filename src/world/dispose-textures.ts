import * as THREE from 'three';

function textures(root: THREE.Object3D): Set<THREE.Texture> {
  const found = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) found.add(value);
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) found.add(uniform.value);
      }
    }
  });
  return found;
}

/** Cached canvas maps can remain on the CPU, but unused tiers must release GPU storage. */
export function disposeUnusedTextures(root: THREE.Object3D, retained?: THREE.Object3D): void {
  const keep = retained ? textures(retained) : new Set<THREE.Texture>();
  for (const texture of textures(root)) if (!keep.has(texture)) texture.dispose();
}
