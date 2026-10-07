// HUD + menus harness. URL: ?state=race|slow|invalid|damage|limiter|mph|lights|noref|menu-loading|
// menu-title|menu-car|menu-settings|menu-pause|menu-controls|menu-results  &animate=1
import * as THREE from 'three';
import { ROAD } from '@/art/palette';
import { createHarnessScene } from '@/harness/harness-scene';
import { createHud, loadHudFonts } from '@/hud';
import { createDemoDriver } from '@/hud/demo-driver';
import { type DemoPreset, type DemoTrack, demoState } from '@/hud/demo-states';
import trackData from '@/track/data/mount-panorama.json';
import { CORNERS } from '@/track/layout';
import { DEFAULT_SETTINGS } from '@/types/session';
import { createMenus } from '@/ui';
import { demoLaps } from '@/ui/demo-results';

// Inline favicon so the page makes no /favicon.ico request (404 noise in shots).
document.head.append(Object.assign(document.createElement('link'), { rel: 'icon', href: 'data:,' }));

const params = new URLSearchParams(location.search);
const preset = params.get('state') ?? 'race';
const animate = params.get('animate') === '1';

function buildTrack(): DemoTrack {
  const pts = trackData.points as number[][];
  const lengthM = trackData.meta.lengthM;
  const minY = Math.min(...pts.map((p) => p[1]));
  return {
    info: {
      outline: pts.map((p) => [p[0], p[2]] as [number, number]),
      sectorStarts: [1968 / lengthM, 4206 / lengthM],
      corners: CORNERS.map((c) => ({ progress: c.s / lengthM, name: c.name, turn: c.turn })),
      lengthM,
    },
    heights: pts.map((p) => p[1] - minY),
    baseAslM: trackData.meta.elevationBaseM + minY,
  };
}

/** A straight with edge lines and kerbs so the HUD sits over a believable track view. */
function addRoad(scene: THREE.Scene): void {
  const mat = (c: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 1400).rotateX(-Math.PI / 2), mat(ROAD.asphalt));
  road.position.set(0, 0.01, 650);
  road.receiveShadow = true;
  scene.add(road);
  for (const x of [-6.1, 6.1]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1400).rotateX(-Math.PI / 2), mat(ROAD.lineWhite));
    line.position.set(x, 0.02, 650);
    scene.add(line);
    for (let z = 40; z < 140; z += 2) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 2), mat((z / 2) % 2 ? ROAD.kerbRed : ROAD.kerbWhite));
      kerb.position.set(x + Math.sign(x) * 0.5, 0.025, z + 1);
      scene.add(kerb);
    }
  }
}

const harness = createHarnessScene({ ground: 'grass', groundSize: 6000 });
addRoad(harness.scene);
harness.camera.fov = 55;
harness.camera.updateProjectionMatrix();
harness.camera.position.set(0.9, 1.35, -4);
harness.controls.target.set(0.4, 1.0, 40);
harness.controls.update();

const overlay = document.createElement('div');
overlay.style.cssText = 'position:fixed;inset:0;';
document.body.append(overlay);

const track = buildTrack();
const hud = createHud();
hud.mount(overlay, track.info);
const menus = createMenus();
menus.mount(
  overlay,
  {
    onStart: (c) => console.info('[harness] start', c.car, c.liveryIndex),
    onResume: () => menus.hide(),
    onRestart: () => menus.hide(),
    onResetCar: () => menus.hide(),
    onQuitToMenu: () => menus.showTitle(),
    onSettingsChange: (s) => console.info('[harness] settings', JSON.stringify(s)),
    onPreviewCar: (car, livery) => console.info('[harness] preview', car, livery),
  },
  { ...DEFAULT_SETTINGS },
);

declare global {
  interface Window {
    /** Debug handle for perf checks: `__hudHarness.bench(600)` = ms for 600 update() calls. */
    __hudHarness?: { bench(frames: number): number };
  }
}
window.__hudHarness = {
  bench(frames: number): number {
    const d = createDemoDriver(track);
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) hud.update(d.step(1 / 60));
    return performance.now() - t0;
  },
};

const HUD_PRESETS: DemoPreset[] = ['race', 'slow', 'invalid', 'damage', 'limiter', 'mph', 'lights', 'noref'];
if (HUD_PRESETS.includes(preset as DemoPreset) || animate) {
  const driver = animate ? createDemoDriver(track) : null;
  const fixed = demoState((HUD_PRESETS.includes(preset as DemoPreset) ? preset : 'race') as DemoPreset, track);
  harness.onFrame((dt) => hud.update(driver ? driver.step(dt) : fixed));
} else {
  hud.update(demoState('race', track));
  hud.setVisible(preset === 'menu-pause' || preset === 'menu-controls');
  const nav = (...actions: Parameters<typeof menus.nav>[0][]): void => actions.forEach((a) => menus.nav(a));
  switch (preset) {
    case 'menu-loading':
      menus.showLoading(0.62, 'Building terrain and trackside');
      break;
    case 'menu-title':
      menus.showTitle();
      break;
    case 'menu-car':
      menus.showCarSelect();
      break;
    case 'menu-settings':
      menus.showTitle();
      nav('down', 'accept', 'down', 'down');
      break;
    case 'menu-pause':
      menus.showPause();
      break;
    case 'menu-controls':
      menus.showPause();
      nav('down', 'down', 'down', 'accept');
      break;
    case 'menu-results': {
      const r = demoLaps();
      menus.showResults(r.laps, r.best);
      break;
    }
    default:
      menus.showTitle();
  }
}

await loadHudFonts();
requestAnimationFrame(() => harness.markReady({ preset, animate }, 12));
