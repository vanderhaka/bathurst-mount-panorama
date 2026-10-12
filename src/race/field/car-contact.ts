import type { Vehicle } from '@/physics/vehicle';
import { projectToTrack } from '@/track/track-query';

/** One resolved car-to-car contact. `speed` = closing speed along the normal (m/s), `y` = mean CG height. */
export interface CarHit { a: number; b: number; x: number; y: number; z: number; nx: number; nz: number; speed: number }

const RESTITUTION = 0.2;
const FRICTION = 0.3;
/** Pairs further apart than this (CG to CG) cannot touch: the half diagonal of a Gen3 is ~2.7 m. */
const BROAD_M = 8;
/** Vertices within this of the deepest one count as the contact patch (a flat face has two). */
const PATCH_M = 0.05;

// Scratch for the vertices of the two rectangles (x, z pairs, 4 each) and the SAT result.
const va = new Float64Array(8), vb = new Float64Array(8);
const sat = { depth: 0, nx: 0, nz: 0 };

function corners(v: Vehicle, out: Float64Array): void {
  const d = v.spec.dimensions, hl = d.length / 2, hw = d.width / 2;
  const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
  for (let k = 0; k < 4; k++) {
    const f = k < 2 ? hl : -hl, l = k % 2 === 0 ? hw : -hw;
    out[k * 2] = v.x + f * sin + l * cos;
    out[k * 2 + 1] = v.z + f * cos - l * sin;
  }
}

/** Min/max of the vertices projected on (ax, az). */
function extent(p: Float64Array, ax: number, az: number): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < 4; k++) {
    const t = p[k * 2] * ax + p[k * 2 + 1] * az;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return [lo, hi];
}

/** SAT over the four face normals. Fills `sat` with the least penetration and the normal pointing a -> b. */
function overlap(a: Vehicle, b: Vehicle): boolean {
  corners(a, va);
  corners(b, vb);
  sat.depth = Infinity;
  for (const v of [a, b]) {
    const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
    for (let k = 0; k < 2; k++) {
      const ax = k === 0 ? sin : cos, az = k === 0 ? cos : -sin;
      const [alo, ahi] = extent(va, ax, az), [blo, bhi] = extent(vb, ax, az);
      const d = Math.min(ahi, bhi) - Math.max(alo, blo);
      if (d <= 0) return false;
      if (d < sat.depth) {
        sat.depth = d;
        const sign = (b.x - a.x) * ax + (b.z - a.z) * az >= 0 ? 1 : -1;
        sat.nx = ax * sign;
        sat.nz = az * sign;
      }
    }
  }
  return true;
}

/** Mean of the vertices of `p` that lie within PATCH_M of the extreme along `dir` (+1 = max). */
function patch(p: Float64Array, nx: number, nz: number, dir: number, out: [number, number]): void {
  let best = -Infinity;
  for (let k = 0; k < 4; k++) best = Math.max(best, dir * (p[k * 2] * nx + p[k * 2 + 1] * nz));
  let sx = 0, sz = 0, c = 0;
  for (let k = 0; k < 4; k++) {
    if (dir * (p[k * 2] * nx + p[k * 2 + 1] * nz) >= best - PATCH_M) { sx += p[k * 2]; sz += p[k * 2 + 1]; c++; }
  }
  out[0] = sx / c;
  out[1] = sz / c;
}

const pa: [number, number] = [0, 0], pb: [number, number] = [0, 0];

/** Yaw inertia scaled with the current (fuel) mass, kg m^2. */
function inertia(v: Vehicle): number { return v.spec.yawInertia * (v.massKg / v.spec.massKg); }

/**
 * Car-to-car contact, resolved once per game-logic step after every car has simulated it. Cars are
 * oriented rectangles (spec length x width, centred on the CG) in the XZ plane; vertical state is
 * untouched. Per overlapping pair: positional separation split by inverse mass, a normal impulse with
 * restitution 0.2, Coulomb friction 0.3 on the tangent, both with the yaw lever arm of the contact
 * point (the mean of the two overlapping vertex patches). The impulse uses the standard effective-mass
 * form, so a contact never adds kinetic energy. `tp` is re-projected for moved cars.
 */
export function resolveCarContacts(cars: readonly Vehicle[], out: CarHit[]): CarHit[] {
  out.length = 0;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx * dx + dz * dz > BROAD_M * BROAD_M || !overlap(a, b)) continue;
      const { depth, nx, nz } = sat;
      const ma = a.massKg, mb = b.massKg, ia = inertia(a), ib = inertia(b);
      patch(va, nx, nz, 1, pa);
      patch(vb, nx, nz, -1, pb);
      const cx = (pa[0] + pb[0]) / 2, cz = (pa[1] + pb[1]) / 2;
      // Separate along the normal, the lighter car moving more.
      const wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.x -= nx * depth * wa; a.z -= nz * depth * wa;
      b.x += nx * depth * wb; b.z += nz * depth * wb;
      // Contact point velocities (a point at r moves with v + w * (rz, -rx)).
      const rax = cx - a.x, raz = cz - a.z, rbx = cx - b.x, rbz = cz - b.z;
      const rvx = b.vx + b.yawRate * rbz - (a.vx + a.yawRate * raz);
      const rvz = b.vz - b.yawRate * rbx - (a.vz - a.yawRate * rax);
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        const ran = raz * nx - rax * nz, rbn = rbz * nx - rbx * nz;
        const jn = (-(1 + RESTITUTION) * vn) / (1 / ma + 1 / mb + (ran * ran) / ia + (rbn * rbn) / ib);
        apply(a, b, ma, mb, ia, ib, rax, raz, rbx, rbz, jn * nx, jn * nz);
        // Friction on the post-impulse tangential velocity, capped by the Coulomb limit.
        const tx = -nz, tz = nx;
        const wx = b.vx + b.yawRate * rbz - (a.vx + a.yawRate * raz);
        const wz = b.vz - b.yawRate * rbx - (a.vz - a.yawRate * rax);
        const vt = wx * tx + wz * tz;
        const rat = raz * tx - rax * tz, rbt = rbz * tx - rbx * tz;
        const jtFree = -vt / (1 / ma + 1 / mb + (rat * rat) / ia + (rbt * rbt) / ib);
        const jt = Math.max(-FRICTION * jn, Math.min(FRICTION * jn, jtFree));
        apply(a, b, ma, mb, ia, ib, rax, raz, rbx, rbz, jt * tx, jt * tz);
      }
      for (const v of [a, b]) projectToTrack(v.track, v.x, v.z, v.tp.index, v.tp);
      out.push({ a: i, b: j, x: cx, y: (a.y + b.y) / 2, z: cz, nx, nz, speed: Math.max(0, -vn) });
    }
  }
  return out;
}

/** Applies impulse (jx, jz) to b and -(jx, jz) to a, at lever arms ra / rb from their CGs. */
function apply(a: Vehicle, b: Vehicle, ma: number, mb: number, ia: number, ib: number, rax: number, raz: number, rbx: number, rbz: number, jx: number, jz: number): void {
  a.vx -= jx / ma; a.vz -= jz / ma;
  b.vx += jx / mb; b.vz += jz / mb;
  a.yawRate -= (raz * jx - rax * jz) / ia;
  b.yawRate += (rbz * jx - rbx * jz) / ib;
}
