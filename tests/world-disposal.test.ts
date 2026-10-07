import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeWorld, type World } from '@/world/world';

function world(map: THREE.Texture, normalMap?: THREE.Texture): World {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial({ map, normalMap: normalMap ?? null })));
  return { root, terrain: { dispose() {} }, scenery: { dispose() {} } } as unknown as World;
}

describe('texture storage released after a world tier rebuild', () => {
  it('frees textures no longer used by the new world, retaining shared cached maps', () => {
    const oldMap = new THREE.Texture(), shared = new THREE.Texture();
    const old = world(oldMap, shared), retained = world(shared);
    const disposeOld = vi.spyOn(oldMap, 'dispose'), disposeShared = vi.spyOn(shared, 'dispose');
    disposeWorld(old, retained);
    expect(disposeOld).toHaveBeenCalledOnce();
    expect(disposeShared).not.toHaveBeenCalled();
  });

  it('disposes a repeated texture only once when no retained world needs it', () => {
    const map = new THREE.Texture();
    const dispose = vi.spyOn(map, 'dispose');
    disposeWorld(world(map, map));
    expect(dispose).toHaveBeenCalledOnce();
  });
});
