// Bolt-on body parts of the classic cars, seated on the lofted surface with ray
// probes: the box bonnet hump's rear-facing scoop opening and its rivets (dark
// plastic), and the wheel-arch flare lips with their dome bolts (painted: they
// sample the livery atlas like the body, so they take the flare's colours).
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import { makeProbe, type BodyProbe } from '@/car/models/body-probe';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, loft, merge } from '@/car/models/geo-utils';
import { regionUV } from '@/car/models/livery-layout';

export interface BoltOnParts {
  plastic: THREE.BufferGeometry[];
  /** Painted parts with livery UVs and white vertex colours (paint material), or null. */
  paint: THREE.BufferGeometry | null;
}

const DOWN = new THREE.Vector3(0, -1, 0);

function dome(c: THREE.Vector3, n: THREE.Vector3, r: number, high: boolean): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, high ? 8 : 5, high ? 4 : 3, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.55, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
  return g.translate(c.x, c.y, c.z);
}

/** Dark plate over the hump's rear face (the scoop opening) and rivets along the foot of each side. */
function hump(probe: BodyProbe, p: BodyProfile, cv: CurveSet, high: boolean): THREE.BufferGeometry[] {
  const h = p.hump;
  if (!h) return [];
  const z = h.scoopZ;
  const w = cv.domeW(z + 0.03);
  const yAt = (x: number, zz: number) => probe.cast(new THREE.Vector3(x, 3, zz), DOWN)?.point.y;
  const yBase = yAt(0, z - 0.012);
  const yTop = yAt(0, z + 0.04);
  const out: THREE.BufferGeometry[] = [];
  if (yBase !== undefined && yTop !== undefined && yTop - yBase > 0.03) {
    const b = yBase + 0.012, t = yTop - 0.014;
    const wb = w - 0.022, wt = w - h.edge - 0.022;
    const mouth: Array<readonly [number, number]> = [[-wb, b], [wb, b], [wt, t], [-wt, t]];
    const zPlate = z - 0.011;
    out.push(extrude(mouth, 0.005, (a, bb, d) => [a, bb, zPlate - d]));
  }
  if (!high || h.rivets < 2) return out;
  const zs = [z + 0.05, Math.max(...h.rows) - 0.12];
  for (const s of [1, -1]) {
    for (let i = 0; i < h.rivets; i++) {
      const zz = zs[0] + ((zs[1] - zs[0]) * i) / (h.rivets - 1);
      const hit = probe.cast(new THREE.Vector3(s * (cv.domeW(zz) + 0.016), 3, zz), DOWN);
      if (hit) out.push(dome(hit.point.addScaledVector(hit.normal, 0.001), hit.normal, 0.0065, high));
    }
  }
  return out;
}

/** Black louvred panel on the side glass just behind the door: a plate and vertical slats standing off the glass. */
function louvre(p: BodyProfile, cv: CurveSet): THREE.BufferGeometry[] {
  const l = p.quarterLouvre;
  if (!l) return [];
  const zDoor = Math.min(p.art.door[2][0], p.art.door[3][0]);
  const out: THREE.BufferGeometry[] = [];
  // A vertical strip on the glass at z, from just above the glass base to just below the rail, `off` m outboard.
  const strip = (s: number, z: number, off: number): THREE.Vector3[] => {
    const g0 = new THREE.Vector2(cv.glassBaseX(z), cv.glassBaseY(z));
    const g1 = new THREE.Vector2(cv.railX(z), Math.max(g0.y, cv.railY(z)));
    const d = g1.clone().sub(g0);
    const n = new THREE.Vector2(d.y, -d.x).normalize().multiplyScalar(off);
    return [0.04, 0.96].map((t) => {
      const q = g0.clone().addScaledVector(d, t).add(n);
      return new THREE.Vector3(s * q.x, q.y, z);
    });
  };
  const quad = (s: number, z0: number, z1: number, off: number, depth: number) => {
    const a = strip(s, z0, off), b = strip(s, z1, off);
    const c = strip(s, z0, off + depth), e = strip(s, z1, off + depth);
    return loft([[a[0], a[1], c[1], c[0]], [b[0], b[1], e[1], e[0]]], true, true);
  };
  for (const s of [1, -1]) {
    out.push(quad(s, zDoor - l.width, zDoor - 0.005, 0.002, 0.003));
    for (let i = 0; i < l.slats; i++) {
      const z = zDoor - 0.005 - ((l.width - 0.01) * (i + 0.5)) / l.slats;
      out.push(quad(s, z - 0.006, z + 0.006, 0.005, 0.006));
    }
  }
  return out;
}

/** Two bonnet pins near the front edge. */
function pins(probe: BodyProbe, p: BodyProfile, high: boolean): THREE.BufferGeometry[] {
  const b = p.bonnetPins;
  if (!b || !high) return [];
  return [1, -1].flatMap((s) => {
    const hit = probe.cast(new THREE.Vector3(s * b.x, 3, b.z), DOWN);
    return hit ? [dome(hit.point.addScaledVector(hit.normal, 0.001), hit.normal, 0.016, high)] : [];
  });
}

/** Livery UVs (side regions) and white vertex colours, so a part takes the paint material. */
function painted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const pos = ng.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = regionUV(pos.getX(i) >= 0 ? 'sideL' : 'sideR', pos.getZ(i), pos.getY(i));
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  ng.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  return ng;
}

/** Rolled lip around each wheel-arch opening and dome bolts on the flare face. */
function flares(probe: BodyProbe, p: BodyProfile, axleZ: number, wheelY: number, high: boolean): THREE.BufferGeometry[] {
  const f = p.flares;
  if (!f) return [];
  const R = p.arch.radius;
  const out: THREE.BufferGeometry[] = [];
  const steps = high ? 18 : 8;
  for (const s of [1, -1]) {
    const inward = new THREE.Vector3(-s, 0, 0);
    const onFlare = (zw: number, r: number, th: number) => {
      const y = wheelY + r * Math.sin(th);
      const z = zw + r * Math.cos(th);
      return probe.cast(new THREE.Vector3(s * 2, y, z), inward);
    };
    for (const zw of [axleZ, -axleZ]) {
      const sections: THREE.Vector3[][] = [];
      for (let i = 0; i <= steps; i++) {
        const th = (Math.PI * i) / steps;
        const hit = onFlare(zw, R + f.lip * 0.5, th);
        if (!hit) continue;
        const radial = new THREE.Vector3(0, Math.sin(th), Math.cos(th));
        const n = hit.normal.clone().sub(radial.clone().multiplyScalar(hit.normal.dot(radial))).normalize();
        const c = hit.point.addScaledVector(n, f.proud / 2 - 0.004);
        sections.push(ringSectionPlane(c, radial, n, f.lip / 2, f.proud / 2 + 0.004, high ? 10 : 6));
      }
      if (sections.length >= 2) out.push(loft(sections, true, true));
      if (!high) continue;
      for (let i = 0; i < f.bolts; i++) {
        const th = 0.2 + ((Math.PI - 0.4) * i) / Math.max(1, f.bolts - 1);
        const hit = onFlare(zw, R + f.boltR, th);
        if (hit) out.push(dome(hit.point.addScaledVector(hit.normal, 0.001), hit.normal, 0.0085, high));
      }
    }
  }
  return out;
}

/** Rounded-rectangle section (squareness 2.6) in the plane of u and v around c. */
function ringSectionPlane(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, ru: number, rv: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const e = 2 / 2.6;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    out.push(c.clone().addScaledVector(u, Math.sign(ct) * Math.abs(ct) ** e * ru).addScaledVector(v, Math.sign(st) * Math.abs(st) ** e * rv));
  }
  return out;
}

export function buildBoltOns(grid: BodyGrid, p: BodyProfile, cv: CurveSet, axleZ: number, wheelY: number, high: boolean): BoltOnParts {
  if (!p.hump && !p.flares && !p.quarterLouvre && !p.bonnetPins) return { plastic: [], paint: null };
  const probe = makeProbe(grid, 0, grid.rows - 1);
  const plastic = [...hump(probe, p, cv, high), ...louvre(p, cv), ...pins(probe, p, high)];
  // Far away (detail 'low') the lips are below a pixel: skip their mesh and its draw call.
  const lips = high ? flares(probe, p, axleZ, wheelY, high) : [];
  probe.dispose();
  return { plastic, paint: lips.length ? painted(merge(lips)) : null };
}
