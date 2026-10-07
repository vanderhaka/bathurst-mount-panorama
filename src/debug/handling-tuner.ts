// "Handling" folder of the tuner (F2): live sliders for the handling multipliers in
// config/handling.ts. The car feels a change at once; the racing-line colours and
// corner-speed hints follow at the next race start.
import type GUI from 'three/addons/libs/lil-gui.module.min.js';
import {
  exportHandling, getHandling, HANDLING_RANGES, importHandling, resetHandling, saveHandling, setHandling, type HandlingConfig,
} from '@/config/handling';

const LABELS: Record<keyof HandlingConfig, string> = {
  grip: 'Tyre grip ×',
  rearGrip: 'Rear grip ×',
  slideGrip: 'Grip in a slide',
  peakSlipDeg: 'Peak slip angle °',
  downforce: 'Downforce ×',
  steerSpeedDeg: 'Steering speed °/s',
};

export function addHandlingFolder(gui: GUI): void {
  const model: HandlingConfig = { ...getHandling() };
  const folder = gui.addFolder('Handling (live)');
  const refresh = (): void => {
    Object.assign(model, getHandling());
    folder.controllersRecursive().forEach((c) => c.updateDisplay());
  };
  for (const key of Object.keys(LABELS) as (keyof HandlingConfig)[]) {
    const [min, max, step] = HANDLING_RANGES[key];
    folder.add(model, key, min, max, step).name(LABELS[key]).onChange((v: number) => setHandling({ [key]: v }));
  }
  folder.add({ note: 'next race' }, 'note').name('Racing line updates').disable();
  folder.add({ save: () => saveHandling() }, 'save').name('Save handling as my default');
  folder.add({ copy: () => void navigator.clipboard?.writeText(exportHandling()).catch(() => {}) }, 'copy').name('Copy handling (JSON)');
  folder.add({ paste: () => {
    const text = window.prompt('Paste handling JSON');
    if (text && importHandling(text)) refresh();
  } }, 'paste').name('Paste handling');
  folder.add({ reset: () => { resetHandling(); refresh(); } }, 'reset').name('Reset handling to defaults');
}
