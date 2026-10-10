import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GROUND, ROAD } from '@/art/palette';
import { getGraphics, setGraphics, type ToneMapper } from '@/config/graphics';
import { createPostChain } from '@/render/post';
import { createRenderer } from '@/render/renderer';
import { createLighting } from '@/world/lighting';
import { createCarEnv } from '@/world/car-env';
import { createSky } from '@/world/sky';

declare global {
  interface Window {
    __shotReady?: boolean;
    __shotInfo?: unknown;
    __harness?: HarnessScene;
  }
}

export interface HarnessScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Frames the camera at a named view around `target`. */
  setView(name: string, target?: THREE.Vector3, distance?: number): void;
  /** Called every frame before render. */
  onFrame(fn: (dt: number, t: number) => void): void;
  /** Marks the page ready for a screenshot after `frames` more frames are rendered. */
  markReady(info?: unknown, frames?: number): void;
}

const VIEWS: Record<string, [number, number, number]> = {
  front: [0, 0.35, 1],
  rear: [0, 0.35, -1],
  side: [1, 0.15, 0],
  left: [1, 0.15, 0],
  right: [-1, 0.15, 0],
  threequarter: [0.85, 0.42, 0.95],
  rearthreequarter: [-0.85, 0.42, -0.95],
  top: [0.001, 1, 0.001],
  low: [0.9, 0.08, 0.7],
};

/**
 * Standard harness: the same renderer, sky, sun, fog and environment map as the
 * game, over a grass + asphalt ground. URL params: ?view=threequarter&dist=8
 */
export function createHarnessScene(opts: { ground?: 'asphalt' | 'grass'; groundSize?: number } = {}): HarnessScene {
  const params = new URLSearchParams(location.search);
  const tone = params.get('tone');
  if (tone && ['ACES', 'AgX', 'Neutral'].includes(tone)) setGraphics({ toneMapping: tone as ToneMapper });
  if (params.has('time')) setGraphics({ timeOfDay: Number(params.get('time')) });
  const renderer = createRenderer({ quality: 'high', preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 20000);
  const sky = createSky(scene);
  const lighting = createLighting(scene, 'high', camera);
  const carEnv = createCarEnv(renderer, scene, sky.dome, 'high');
  void carEnv.ensureHdri();
  scene.environmentIntensity = getGraphics().envIntensity;
  lighting.apply(getGraphics());
  const post = createPostChain(renderer, 4);
  post.setEnabled(true, 4, true, true, true);
  post.apply(getGraphics());

  const size = opts.groundSize ?? 400;
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: GROUND.grass, roughness: 1 }),
  );
  grass.receiveShadow = true;
  scene.add(grass);
  if ((opts.ground ?? 'asphalt') === 'asphalt') {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: ROAD.asphalt, roughness: 0.92 }),
    );
    pad.position.y = 0.005;
    pad.receiveShadow = true;
    scene.add(pad);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;

  const frameFns: Array<(dt: number, t: number) => void> = [];
  let readyCountdown = -1;
  let readyInfo: unknown = null;

  const harness: HarnessScene = {
    renderer,
    scene,
    camera,
    controls,
    setView(name, target = new THREE.Vector3(0, 0.6, 0), distance = Number(params.get('dist') ?? 8)) {
      const v = VIEWS[name] ?? VIEWS.threequarter;
      const dir = new THREE.Vector3(...v).normalize();
      camera.position.copy(target).addScaledVector(dir, distance);
      controls.target.copy(target);
      camera.lookAt(target);
      controls.update();
    },
    onFrame(fn) {
      frameFns.push(fn);
    },
    markReady(info, frames = 3) {
      readyInfo = info ?? null;
      readyCountdown = frames;
      window.__shotReady = false;
    },
  };
  window.__harness = harness;
  harness.setView(params.get('view') ?? 'threequarter');

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    lighting.resize();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
  });

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    for (const fn of frameFns) fn(dt, timer.getElapsed());
    controls.update();
    lighting.follow(controls.target);
    sky.follow(camera);
    post.render(scene, camera);
    if (readyCountdown > 0 && --readyCountdown === 0) {
      window.__shotInfo = { ...(readyInfo as object), drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
      window.__shotReady = true;
    }
  });
  return harness;
}
