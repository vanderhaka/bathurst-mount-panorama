// Props library: instanced prop assets (one geometry + one shared material per
// kind × variant) and one-off structures. Visual tunables live in look.ts.
export { getPropAsset, PROP_VARIANTS } from '@/props/registry';
export { structures } from '@/props/structures';
export { PROPS_LOOK, setPropsLook, resetPropsLook, clearPropCache, onPropsLookChange } from '@/props/look';
export type { PropsLook } from '@/props/look';
