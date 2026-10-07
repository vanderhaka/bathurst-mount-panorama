#!/usr/bin/env node
// Captures a frozen evidence set for independent review: menus, every famous corner
// in race view with the HUD, camera modes, damage, ghost, racing line, a timed AI lap,
// performance metrics and console errors.
// Usage: node scripts/capture-evidence.mjs <out-dir> [--url http://127.0.0.1:5180/] [--car camaro|mustang|supra]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';

const args = process.argv.slice(2);
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'artifacts/review/latest');
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const url = opt('url', 'http://127.0.0.1:5180/');
const car = opt('car', 'camaro');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await authenticatePreview(page, url);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const metrics = { car, shots: [] };
const shot = async (name) => { const p = `${out}/${name}.png`; await page.screenshot({ path: p }); metrics.shots.push(name); };
const wait = (ms) => page.waitForTimeout(ms);
const key = (k) => page.keyboard.press(k);

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
metrics.loadMs = Date.now() - t0;
await wait(3500);
await shot('01-title');
await key('Enter'); await wait(1500);
// Car select starts on the Camaro; the order is camaro, mustang, supra (src/ui/car-data.ts).
for (let i = 0; i < ['camaro', 'mustang', 'supra'].indexOf(car); i++) { await key('ArrowRight'); await wait(1200); }
await shot('02-car-select');
await key('ArrowRight'); await wait(1500);
await shot('03-car-select-other');
await key('ArrowLeft'); await wait(1200);
await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
await wait(2600);
await shot('04-grid-lights');
await page.waitForFunction(() => window.__game?.race?.session.lights < 0, null, { timeout: 20000 });

const g = (fn, arg) => page.evaluate(fn, arg);
await g(() => { window.__game.settings.showFps = true; window.__game.setDebugAutopilot(true); });
const corners = [
  ['10-hell-corner', 380], ['11-mountain-straight', 1000], ['12-griffins-bend', 1500], ['13-the-cutting', 1990],
  ['14-reid-park', 2330], ['15-mcphillamy-park', 2990], ['16-skyline', 3330], ['17-the-dipper', 3560],
  ['18-forrests-elbow', 3900], ['19-conrod-straight', 4500], ['20-the-chase', 5480], ['21-murrays-corner', 6060],
];
for (const [name, s] of corners) {
  await g((s) => window.__game.debugTeleport(s), s);
  await wait(1700);
  await shot(name);
}
// Camera modes on Conrod.
await g(() => window.__game.debugTeleport(4300));
for (const mode of ['cockpit', 'bonnet', 'chaseFar', 'tv']) {
  await g((m) => { const game = window.__game; game.rig.mode = m; game.rig.snap(); }, mode);
  await wait(1400);
  await shot(`30-camera-${mode}`);
}
await g(() => { const game = window.__game; game.rig.mode = 'chase'; game.rig.snap(); game.settings.racingLine = 'full'; });
await g(() => window.__game.debugTeleport(5380));
await wait(1500);
await shot('31-racing-line-full');
await g(() => { window.__game.settings.racingLine = 'braking'; });

// Performance at three places (frames counted for 3 s).
const perf = async (s) => {
  await g((s) => window.__game.debugTeleport(s), s);
  await wait(800);
  return g(() => new Promise((res) => {
    const game = window.__game; const r = game.stage.renderer;
    let n = 0, calls = 0, tris = 0; const t0 = performance.now();
    const orig = r.render.bind(r);
    r.render = (sc, c) => { orig(sc, c); if (sc === game.stage.scene) { calls = Math.max(calls, r.info.render.calls); tris = Math.max(tris, r.info.render.triangles); } };
    const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else { r.render = orig; res({ fps: Math.round(n / ((performance.now() - t0) / 1000)), calls, tris }); } };
    requestAnimationFrame(f);
  }));
};
metrics.perf = { pitStraight: await perf(200), mountain: await perf(1200), skyline: await perf(3330), conrod: await perf(4600) };

// Damage: drive into the Conrod wall without the autopilot.
await g(() => { window.__game.setDebugAutopilot(false); window.__game.debugTeleport(4700); });
await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight');
await wait(1600);
await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
await wait(900);
await shot('40-damage');
metrics.damage = await g(() => ({ ...window.__game.race.player.vehicle.damage }));

// A full timed AI lap at 3x speed, then the ghost on the next lap.
await g(() => { const game = window.__game; game.race.session.placeOnGrid(); game.race.player.repair(); game.debugTeleport(6000); game.setDebugAutopilot(true); game.timeScale = 3; });
await page.waitForFunction(() => window.__game.race.session.timer.lapNumber >= 2, null, { timeout: 240000, polling: 250 });
await g(() => { window.__game.timeScale = 1; });
await wait(4000);
await shot('41-ghost-lap');
metrics.laps = await g(() => window.__game.race.session.laps.slice(-3));
await key('Escape'); await wait(900);
await shot('50-pause');
metrics.errors = errors.slice(0, 40);
writeFileSync(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 1));
await browser.close();
if (errors.some(e => e.startsWith('[error]') || e.startsWith('[pageerror]'))) process.exitCode = 1;
