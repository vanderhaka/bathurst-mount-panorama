// Props harness. URL params:
//   (none)                 gallery of every instanced kind, all variants, labelled
//   ?kinds=a,b             gallery restricted to some kinds (?scale=real: real sizes, banded)
//   ?kind=eucalyptus       all variants of one kind, larger
//   ?structure=pitBuilding|controlTower|grandstand|startGantry|footBridge|videoScreen|building|hillsideLetters
//   ?forest=1              200 m x 200 m stand of 400 mixed trees on rolling ground (InstancedMesh + LOD)
//   ?lod=near|far|auto     forest/kind: force a level of detail (default auto)
//   ?flat=0                smooth shading (PROPS_LOOK.shading.flat = false)
//   ?view=..&dist=..       camera, handled by the harness
import * as THREE from 'three';
import { createHarnessScene } from '@/harness/harness-scene';
import { buildForest } from '@/props/harness/forest';
import { buildGallery, buildKindRow } from '@/props/harness/gallery';
import { buildStructureView } from '@/props/harness/structures';
import type { InstancedPropKind } from '@/types/props';
import { setPropsLook } from '@/props';

const params = new URLSearchParams(location.search);
// Inline favicon so the page makes no failing request.
const icon = document.createElement('link');
icon.rel = 'icon';
icon.href = 'data:,';
document.head.appendChild(icon);
const h = createHarnessScene({ ground: 'grass', groundSize: 1200 });
const labels = document.createElement('div');
labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:11px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#fff;';
document.body.appendChild(labels);

interface Label {
  el: HTMLDivElement;
  at: THREE.Vector3;
}
const tags: Label[] = [];
function addLabel(text: string, at: THREE.Vector3): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:absolute;transform:translate(-50%,0);padding:1px 4px;background:rgba(20,24,28,.62);border-radius:3px;white-space:nowrap;';
  labels.appendChild(el);
  tags.push({ el, at });
}

const v = new THREE.Vector3();
h.onFrame(() => {
  for (const t of tags) {
    v.copy(t.at).project(h.camera);
    const show = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    t.el.style.display = show ? 'block' : 'none';
    if (show) {
      t.el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      t.el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    }
  }
});

function frame(target: THREE.Vector3, defaultDist: number, defaultView = 'threequarter'): void {
  const dist = Number(params.get('dist') ?? defaultDist);
  h.setView(params.get('view') ?? defaultView, target, dist);
}

if (params.get('flat') === '0') setPropsLook({ shading: { flat: false } });
const lodMode = (params.get('lod') ?? 'auto') as 'near' | 'far' | 'auto';
const structure = params.get('structure');
const kind = params.get('kind') as InstancedPropKind | null;

if (params.get('forest')) {
  const r = buildForest(h, lodMode);
  frame(r.target, 210, 'low');
  h.markReady({ mode: 'forest', forest: r.stats }, 8);
} else if (structure) {
  const r = buildStructureView(h.scene, structure, params);
  frame(r.target, r.dist);
  h.markReady({ mode: 'structure', structure, ...r.stats }, 6);
} else if (kind) {
  const r = buildKindRow(h.scene, kind, lodMode === 'far', addLabel);
  frame(r.target, r.dist, 'front');
  h.markReady({ mode: 'kind', kind, ...r.stats }, 6);
} else {
  const only = params.get('kinds')?.split(',') as InstancedPropKind[] | undefined;
  const r = buildGallery(h.scene, only, addLabel, params.get('scale') === 'real');
  frame(r.target, r.dist, params.get('scale') === 'real' ? 'threequarter' : 'front');
  h.markReady({ mode: 'gallery', ...r.stats }, 6);
}
