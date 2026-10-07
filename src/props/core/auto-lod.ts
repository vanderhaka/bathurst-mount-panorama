import * as THREE from 'three';

/**
 * Far stand-in for a small prop (campers, tents, cars, people): one box over the
 * prop's bounds in its average colour (10 triangles, no bottom). `fromY` raises the
 * box base (0..1 of the height) for open shapes such as a gazebo canopy.
 */
export function autoLod(geo: THREE.BufferGeometry, fromY = 0): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.getAttribute('position'), col = geo.getAttribute('color'), mask = geo.getAttribute('tintMask');
  const idx = geo.index;
  // Area-weighted average colour (separately for upward faces: roofs, flys, awnings) and tint mask.
  const sum = new THREE.Vector3(), topSum = new THREE.Vector3();
  let tint = 0, area = 0, topArea = 0;
  const nrm = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tris = (idx ? idx.count : pos.count) / 3;
  for (let t = 0; t < tris; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const cy = (a.y + b.y + c.y) / 3;
    nrm.copy(b.sub(a)).cross(c.sub(a));
    const w = nrm.length() / 2;
    area += w;
    const k = col ? new THREE.Vector3(col.getX(i0), col.getY(i0), col.getZ(i0)).multiplyScalar(w) : null;
    if (k) sum.add(k);
    if (k && Math.abs(nrm.y) > 0.6 * nrm.length() && cy > (bb.min.y + bb.max.y) / 2) { topSum.add(k); topArea += w; }
    if (mask) tint += mask.getX(i0) * w;
  }
  const avg = area > 0 && col ? sum.divideScalar(area) : new THREE.Vector3(0.7, 0.7, 0.7);
  const y0 = bb.min.y + (bb.max.y - bb.min.y) * fromY;
  const box = new THREE.BoxGeometry(bb.max.x - bb.min.x, bb.max.y - y0, bb.max.z - bb.min.z)
    .translate((bb.max.x + bb.min.x) / 2, (bb.max.y + y0) / 2, (bb.max.z + bb.min.z) / 2)
    .toNonIndexed();
  box.deleteAttribute('uv');
  // Drop the two bottom triangles (never seen).
  const p = box.getAttribute('position');
  const keep: number[] = [];
  for (let t = 0; t < p.count / 3; t++) {
    const low = [0, 1, 2].every((k) => Math.abs(p.getY(t * 3 + k) - y0) < 1e-4);
    if (!low) for (let k = 0; k < 3; k++) keep.push(p.getX(t * 3 + k), p.getY(t * 3 + k), p.getZ(t * 3 + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  out.computeVertexNormals();
  const n = keep.length / 3;
  const top = topArea > 0 ? topSum.divideScalar(topArea) : avg;
  const colours = new Float32Array(n * 3);
  // Top face in the roof colour, sides in the overall average (two flat triangles each).
  for (let t = 0; t < n / 3; t++) {
    const isTop = [0, 1, 2].every((q) => Math.abs(keep[(t * 3 + q) * 3 + 1] - bb.max.y) < 1e-4);
    const k = isTop ? top : avg;
    for (let q = 0; q < 3; q++) colours.set([k.x, k.y, k.z], (t * 3 + q) * 3);
  }
  out.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  if (mask) out.setAttribute('tintMask', new THREE.BufferAttribute(new Float32Array(n).fill(area > 0 && tint / area > 0.3 ? 1 : 0), 1));
  return out;
}
