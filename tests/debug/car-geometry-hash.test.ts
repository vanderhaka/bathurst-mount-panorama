// Diagnostic: prints a hash of every car model's geometry (all meshes, all attributes,
// instance matrices) at both detail levels. Run before and after a car-model change to
// prove that the other cars stay byte-identical:
// npx vitest run --config vitest.debug.config.ts tests/debug/car-geometry-hash.test.ts --silent=false
import * as THREE from 'three';
import { it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS } from '@/car/liveries';
import { createCarModel } from '@/car/models';

function fnv(h: number, bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h;
}

const asBytes = (a: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

function hashModel(kind: CarKind, detail: 'high' | 'low'): string {
  const model = createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail });
  model.root.updateMatrixWorld(true);
  let h = 2166136261;
  let meshes = 0;
  model.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    h = fnv(h, new TextEncoder().encode(o.name));
    const g = o.geometry as THREE.BufferGeometry;
    for (const name of Object.keys(g.attributes).sort()) h = fnv(h, asBytes(g.getAttribute(name).array as Float32Array));
    if (g.index) h = fnv(h, asBytes(g.index.array as Uint32Array));
    h = fnv(h, asBytes(new Float32Array(o.matrixWorld.elements)));
    if (o instanceof THREE.InstancedMesh) h = fnv(h, asBytes(o.instanceMatrix.array as Float32Array));
  });
  return `${meshes} meshes ${h.toString(16).padStart(8, '0')}`;
}

it('prints the geometry hash of every car', () => {
  const kinds = Object.keys(CAR_SPECS) as CarKind[];
  for (const kind of kinds) {
    for (const detail of ['high', 'low'] as const) console.log(`HASH ${kind} ${detail}: ${hashModel(kind, detail)}`);
  }
});
