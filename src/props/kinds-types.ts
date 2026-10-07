import type * as THREE from 'three';

/** What a prop builder returns for one variant. */
export interface BuiltProp {
  geometry: THREE.BufferGeometry;
  lod?: THREE.BufferGeometry;
  /** Overrides the bounding-box footprint radius. */
  radius?: number;
  /** Overrides the bounding-box height. */
  height?: number;
}

export interface KindBuilder {
  variants: number;
  tintable: boolean;
  castShadow: boolean;
  /** Uses the rougher foliage material. */
  foliage?: boolean;
  /** Overrides the shared material (e.g. gum trees: leaf-only hue tint). */
  material?: () => THREE.Material;
  build(variant: number): BuiltProp;
}
