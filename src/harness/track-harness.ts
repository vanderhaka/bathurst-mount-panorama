// Track viewer for screenshots: ?s=<metres>&d=<lateral>&h=<eye height>&ahead=<m>&view=drive|aerial|chase
import * as THREE from 'three';
import { getGraphics, onGraphicsChange, setGraphics, type ToneMapper } from '@/config/graphics';
import { createPostChain } from '@/render/post';
import { createRenderer } from '@/render/renderer';
import { pointAt } from '@/track/track-query';
import { createLighting, createSkyEnvironment } from '@/world/lighting';
import { createSky } from '@/world/sky';
import { buildWorld } from '@/world/world';

declare global {
  interface Window { __shotReady?: boolean; __shotInfo?: unknown; __view?: (s: number, d?: number) => void; __pick?: (px: number, py: number) => string[] }
}

const params = new URLSearchParams(location.search);
const tone = params.get('tone');
if (tone && ['ACES', 'AgX', 'Neutral'].includes(tone)) setGraphics({ toneMapping: tone as ToneMapper });
if (params.has('time')) setGraphics({ timeOfDay: Number(params.get('time')) });
const renderer = createRenderer({ quality: 'high' });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(getGraphics().fov, window.innerWidth / window.innerHeight, 0.1, 20000);
const sky = createSky(scene);
const lighting = createLighting(scene, 'high', camera);
let environment = createSkyEnvironment(renderer, sky.dome);
scene.environment = environment.texture;
scene.environmentIntensity = getGraphics().envIntensity;
const post = createPostChain(renderer, 4);
post.setSize(window.innerWidth, window.innerHeight);
post.setEnabled(true, 4, true, true);
post.apply(getGraphics());
onGraphicsChange((cfg) => {
  sky.apply(cfg);
  lighting.apply(cfg);
  post.apply(cfg);
  const old = environment;
  environment = createSkyEnvironment(renderer, sky.dome);
  scene.environment = environment.texture;
  old.dispose();
});

const t0 = performance.now();
const world = await buildWorld(renderer);
scene.add(world.root);
const buildMs = Math.round(performance.now() - t0);

const a: [number, number, number] = [0, 0, 0], b: [number, number, number] = [0, 0, 0];
const focus = new THREE.Vector3();
function setView(s: number, dOverride?: number) {
  const view = params.get('view') ?? 'drive';
  const track = world.track;
  const idx = Math.round(track.wrapS(s) / track.spacing) % track.n;
  const d = dOverride ?? Number(params.get('d') ?? world.line.offset[idx]);
  const ahead = Number(params.get('ahead') ?? 45);
  if (view === 'aerial') {
    pointAt(track, s, 0, a);
    const h = Number(params.get('h') ?? 400);
    camera.position.set(a[0] + 0.01, a[1] + h, a[2] + h * 0.6);
    camera.lookAt(a[0], a[1], a[2]);
    focus.set(a[0], a[1], a[2]);
  } else {
    const h = Number(params.get('h') ?? (view === 'chase' ? 3.2 : 1.15));
    const back = view === 'chase' ? 9 : 0;
    pointAt(track, s - back, d, a);
    pointAt(track, s + ahead, d, b);
    camera.position.set(a[0], a[1] + h, a[2]);
    camera.lookAt(b[0], b[1] + (view === 'chase' ? 0.5 : 0.9), b[2]);
    pointAt(track, s, d, a);
    focus.set(a[0], a[1], a[2]);
  }
  camera.fov = Number(params.get('fov') ?? getGraphics().fov);
  camera.updateProjectionMatrix();
  lighting.resize();
}
window.__view = setView;
/** Debug: names of the objects under a screen pixel (nearest first). */
window.__pick = (px, py) => {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1), camera);
  return ray.intersectObject(scene, true).slice(0, 4).map((h) => `${h.object.name || h.object.type}<${h.object.parent?.name ?? ''} @${h.distance.toFixed(0)}m`);
};
setView(Number(params.get('s') ?? 150));

let frames = 0;
renderer.setAnimationLoop(() => {
  world.scenery.update(camera.position);
  lighting.follow(focus);
  sky.follow(camera);
  post.render(scene, camera);
  if (++frames === 4) {
    window.__shotInfo = { buildMs, scenery: world.scenery.stats };
    window.__shotReady = true;
  }
});
