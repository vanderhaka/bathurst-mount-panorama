// Visual damage: direction-aware dents with smooth falloff (cumulative and
// capped so panels never fold through each other), darkened paint and canvas
// scrapes down to bare carbon, and part failures (bumper corners sag, bonnet
// buckles, splitter drops and drags, wing bends, hangs and tears off, lights
// break). Zone levels follow the same rules as src/physics/damage.ts so that
// what the player sees matches the HUD.
import * as THREE from 'three';
import type { ImpactEvent } from '@/types/car-model';
import type { BodyGrid } from '@/car/models/body-grid';
import { refreshBodyMeshes, type BodyMeshes } from '@/car/models/body-mesh';
import { dentField, gridField, meshField, writeField, type Dent } from '@/car/models/damage-field';
import { hangDents, killTail, loadRear, newlyHung, poseEndplates, rearScrapes, rearState, resetRear } from '@/car/models/damage-rear';
import type { CarLook, CarMaterialSet } from '@/car/models/look';
import type { LiveryTextures } from '@/car/models/livery-texture';
import type { HingedPart } from '@/car/models/car-parts';
import type { LightSet } from '@/car/models/lights';
import type { AtlasRegion } from '@/car/models/livery-layout';
import { poseSplitter, poseWing, type DamageLevels } from '@/car/models/damage-parts';

export interface DamageTargets {
  grid: BodyGrid;
  shell: BodyMeshes;
  generic: THREE.Mesh[];
  splitter: HingedPart | null;
  wing: HingedPart | null;
  lights: LightSet;
  mats: CarMaterialSet;
  tex: LiveryTextures | null;
  look: CarLook;
  zFront: number;
  zRear: number;
  /** Height of the top surface near the nose (bonnet front edge). */
  noseTopY: number;
}

export interface Zones { front: number; rear: number; left: number; right: number }

export interface Damage {
  apply(i: ImpactEvent): void;
  zones(): Zones;
  reset(): void;
}

function regionFor(i: ImpactEvent): [AtlasRegion, number, number] {
  const { point: c, direction: d } = i;
  if (Math.abs(c.x) > 0.55 && Math.abs(d.x) >= Math.abs(d.z) * 0.6) return [c.x > 0 ? 'sideL' : 'sideR', c.z, c.y];
  if (c.z > 1.8) return ['front', c.x, c.y];
  if (c.z < -1.9) return ['rear', c.x, c.y];
  return ['top', c.z, c.x];
}

export function createDamage(t: DamageTargets): Damage {
  const grid = gridField(t.grid, t.shell);
  const gridPos = new Float32Array(grid.rest.length);
  const scuff = new Float32Array(grid.rest.length / 3);
  const generic = t.generic.map((m) => ({ mesh: m, field: meshField(m) }));
  const lv: DamageLevels = { front: 0, rear: 0, left: 0, right: 0, aero: 0, side: 1, wingTorn: false };
  const sagged = { left: false, right: false };
  const rear = rearState();
  const endplates = generic.find((g) => g.mesh.name === 'wing-endplates')?.field ?? null;
  let buckled = false;
  let seed = 1;

  const refresh = () => {
    writeField(grid, gridPos);
    refreshBodyMeshes(t.grid, t.shell, gridPos);
    const col = t.shell.paint.geometry.getAttribute('color') as THREE.BufferAttribute;
    const ids = t.shell.paint.grid;
    for (let e = 0; e < ids.length; e++) {
      const s = Math.min(0.85, scuff[ids[e]]);
      col.setXYZ(e, 1 - s * 0.78, 1 - s * 0.79, 1 - s * 0.8);
    }
    col.needsUpdate = true;
    for (const { mesh, field } of generic) {
      const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      writeField(field, p.array as Float32Array);
      p.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
  };

  const dentAll = (d: Dent, scuffGain: number) => {
    const maxDent = t.look.damage.maxDent;
    dentField(grid, d, maxDent, (i, w) => { scuff[i] += w * scuffGain; });
    for (const g of generic) dentField(g.field, d, maxDent);
  };

  const breakLights = (i: ImpactEvent) => {
    if (i.severity < t.look.damage.lightBreakSeverity) return;
    const sets: Array<[THREE.Mesh, THREE.Vector3[]]> = [[t.lights.head, t.lights.headCentres], [t.lights.tail, t.lights.tailCentres]];
    for (const [mesh, centres] of sets) {
      if (!Array.isArray(mesh.material)) continue;
      centres.forEach((c, k) => {
        if (c.distanceTo(i.point) < 0.35 + 0.35 * i.severity) (mesh.material as THREE.Material[])[k] = t.mats.broken;
      });
    }
  };

  /** Secondary deformation once the front is badly hit: corners sag, the bonnet front buckles up. */
  const crumpleFront = (c: THREE.Vector3, sev: number) => {
    const dl = t.look.damage;
    if (lv.front < dl.splitterHang) return;
    const corners: Array<'left' | 'right'> = Math.abs(c.x) < 0.3 ? ['left', 'right'] : [c.x > 0 ? 'left' : 'right'];
    for (const corner of corners) {
      if (sagged[corner]) continue;
      sagged[corner] = true;
      const s = corner === 'left' ? 1 : -1;
      dentAll({ c: new THREE.Vector3(s * 0.78, 0.24, t.zFront - 0.15), dir: new THREE.Vector3(s * 0.25, -1, 0.2).normalize(), radius: 0.55, depth: 0.12, facingFloor: 1 }, 0.4);
    }
    if (!buckled) {
      buckled = true;
      dentAll({ c: new THREE.Vector3(c.x * 0.5, t.noseTopY, t.zFront - 0.45), dir: new THREE.Vector3(0, 1, -0.25).normalize(), radius: 0.5, depth: 0.05 + 0.04 * sev, facingFloor: 1 }, 0.2);
    }
  };

  return {
    apply(i) {
      const sev = Math.max(0, Math.min(1, i.severity));
      if (sev <= 0) return;
      const dl = t.look.damage;
      const c = i.point;
      const dir = i.direction.clone().normalize();
      dentAll({ c, dir, radius: dl.dentRadius * (0.5 + 0.5 * sev), depth: dl.dentStrength * sev, facingFloor: 0.25 }, sev * dl.scuffStrength);
      // Same zone rules as the physics (front/rear beyond ~45% of the half length).
      const halfLen = (t.zFront - t.zRear) / 2;
      const add = (k: 'front' | 'rear' | 'left' | 'right' | 'aero', v: number) => { lv[k] = Math.min(1, lv[k] + v); };
      if (c.z > halfLen * 0.45) { add('front', sev * 0.9); add('aero', sev * 0.6); }
      else if (c.z < -halfLen * 0.45) { add('rear', sev * 0.9); add('aero', sev * 0.5); }
      if (c.x > 0.3) add('left', sev * 0.8);
      if (c.x < -0.3) add('right', sev * 0.8);
      lv.side = lv.left >= lv.right ? 1 : -1;
      if (c.z > halfLen * 0.45) crumpleFront(c, sev);
      if (c.z < -halfLen * 0.45 && sev >= dl.wingBreak && lv.aero >= dl.wingHang) lv.wingTorn = true;
      if (c.z < -0.3) loadRear(rear, c, sev);
      for (const corner of newlyHung(rear, lv.rear)) {
        for (const d of hangDents(corner, t.zRear)) dentAll(d, 0.5);
        killTail(t.lights, corner, t.mats.broken);
      }
      if (endplates) poseEndplates(endplates, rear);
      breakLights(i);
      poseSplitter(t.splitter, lv, dl);
      poseWing(t.wing, lv, dl);
      refresh();
      if (t.tex) {
        const [region, a, b] = regionFor(i);
        t.tex.scratch(region, a, b, sev, seed++);
        if (c.z < -0.3) for (const [r, sa, sb] of rearScrapes(c, t.zRear)) t.tex.scratch(r, sa, sb, sev * 0.85, seed++);
      }
    },
    zones: () => ({ front: lv.front, rear: lv.rear, left: lv.left, right: lv.right }),
    reset() {
      grid.disp.fill(0);
      scuff.fill(0);
      for (const g of generic) g.field.disp.fill(0);
      Object.assign(lv, { front: 0, rear: 0, left: 0, right: 0, aero: 0, side: 1, wingTorn: false });
      sagged.left = sagged.right = false;
      resetRear(rear);
      if (endplates) poseEndplates(endplates, rear);
      buckled = false;
      for (const mesh of [t.lights.head, t.lights.tail]) {
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(() => (mesh === t.lights.head ? t.mats.head : t.mats.tail));
      }
      poseSplitter(t.splitter, lv, t.look.damage);
      poseWing(t.wing, lv, t.look.damage);
      refresh();
      t.tex?.repaint();
    },
  };
}
