// Cars harness. URL params:
//   car=camaro|mustang|supra|both|all   (both = Camaro and Mustang side by side; all = the three)
//   livery=0..3               preset index from LIVERY_PRESETS
//   view=front|rear|side|threequarter|rearthreequarter|top|low|cockpit|bonnet
//   dist=<m>                  camera distance (harness)
//   damage=<0..1>             applies a fixed sequence of impacts scaled by the value
//   ghost=1                   ghost look
//   detail=low                far / ghost level of detail
//   steer=<rad>               front-wheel and steering-wheel angle
//   spin=1                    spin the wheels (and pulse the brake lights)
//   brake=1                   brake lights on and hot discs
//   target=x,y,z              camera target (default 0,0.55,0)
//   az=<deg>&el=<deg>         custom camera azimuth (0 = front, 90 = left side) and elevation
import '@/hud/fonts';
import * as THREE from 'three';
import { createHarnessScene } from '@/harness/harness-scene';
import { createCarModel } from '@/car/models';
import { LIVERY_PRESETS } from '@/car/liveries';
import type { CarKind } from '@/car/car-specs';
import type { CarModel, ImpactEvent, WheelIndex } from '@/types/car-model';

const params = new URLSearchParams(location.search);
const icon = document.createElement('link');
icon.rel = 'icon';
icon.href = 'data:,';
document.head.appendChild(icon);

const carParam = params.get('car') ?? 'camaro';
const SINGLE: CarKind[] = ['camaro', 'mustang', 'supra'];
const kinds: CarKind[] = carParam === 'all' ? SINGLE : carParam === 'both' ? ['camaro', 'mustang'] : [SINGLE.find((k) => k === carParam) ?? 'camaro'];
const liveryIndex = Number(params.get('livery') ?? 0);
const detail = params.get('detail') === 'low' ? 'low' : 'high';
const view = params.get('view') ?? 'threequarter';
const steer = Number(params.get('steer') ?? 0);
const damage = Number(params.get('damage') ?? 0);

/** A repeatable crash: front-left hit, nose hit, rear-right hit, side scrape, rear hit. */
function damageSequence(level: number): ImpactEvent[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const hits: Array<[THREE.Vector3, THREE.Vector3, number]> = [
    [v(0.75, 0.45, 2.15), v(-0.55, 0, -0.83), 0.9],
    [v(0.0, 0.35, 2.36), v(0, 0, -1), 0.6],
    [v(-0.8, 0.5, -2.2), v(0.6, 0, 0.8), 0.6],
    [v(0.95, 0.55, 0.2), v(-1, 0, 0), 0.35],
    [v(0.2, 0.7, -2.5), v(0, 0, 1), 0.45],
  ];
  return hits.map(([point, direction, s]) => ({ point, direction: direction.normalize(), severity: Math.min(1, s * level) }));
}

async function main(): Promise<void> {
  try { await document.fonts.load('700 100px "Barlow Condensed"'); } catch { /* fallback font */ }
  const h = createHarnessScene();
  const t0 = performance.now();
  const models: CarModel[] = kinds.map((kind) => {
    const presets = LIVERY_PRESETS[kind];
    const livery = presets[((liveryIndex % presets.length) + presets.length) % presets.length].livery;
    return createCarModel(kind, { livery, detail });
  });
  const buildMs = Math.round((performance.now() - t0) / models.length);
  models.forEach((m, i) => {
    m.root.position.x = (((models.length - 1) / 2) - i) * 2.8;
    h.scene.add(m.root);
    for (const w of [0, 1] as WheelIndex[]) m.setWheel(w, 0, steer, 0);
    m.setSteeringWheel(steer * 6);
    if (params.get('brake') === '1') { m.setBrakeLights(true); m.setBrakeGlow(1); }
    if (damage > 0) for (const hit of damageSequence(damage)) m.applyImpact(hit);
    if (params.get('ghost') === '1') m.setGhost(true);
  });

  const first = models[0];
  if (view === 'cockpit' || view === 'bonnet') {
    const anchor = view === 'cockpit' ? first.cockpitCamera : first.bonnetCamera;
    first.root.updateMatrixWorld(true);
    const pos = anchor.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(anchor.getWorldQuaternion(new THREE.Quaternion()));
    h.camera.fov = view === 'cockpit' ? 75 : 65;
    h.camera.near = 0.02;
    h.camera.updateProjectionMatrix();
    h.camera.position.copy(pos);
    h.controls.target.copy(pos).addScaledVector(dir, 10);
    h.camera.lookAt(h.controls.target);
  } else {
    const t = (params.get('target') ?? '0,0.55,0').split(',').map(Number);
    const target = new THREE.Vector3(t[0] ?? 0, t[1] ?? 0.55, t[2] ?? 0);
    const dist = Number(params.get('dist') ?? (models.length > 1 ? 11 : 8));
    h.setView(view, target, dist);
    if (params.has('az')) {
      const az = (Number(params.get('az')) * Math.PI) / 180;
      const el = (Number(params.get('el') ?? 12) * Math.PI) / 180;
      h.camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(target);
      h.camera.lookAt(target);
    }
  }

  if (params.get('spin') === '1') {
    let spin = 0;
    h.onFrame((dt, t) => {
      spin += dt * 20;
      for (const m of models) {
        for (const w of [0, 1, 2, 3] as WheelIndex[]) m.setWheel(w, spin, w < 2 ? steer : 0, 0);
        m.setBrakeLights(Math.sin(t * 3) > 0);
      }
    });
  }

  let triangles = 0;
  let drawCalls = 0;
  for (const m of models) {
    m.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const g = o.geometry;
      const count = g.index ? g.index.count : g.getAttribute('position').count;
      const inst = o instanceof THREE.InstancedMesh ? o.count : 1;
      triangles += (count / 3) * inst;
      drawCalls += Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;
    });
  }
  h.markReady({ car: carParam, triangles: Math.round(triangles), drawCalls, modelTriangles: Math.round(triangles), modelDrawCalls: drawCalls, buildMs }, 6);
}

void main();
