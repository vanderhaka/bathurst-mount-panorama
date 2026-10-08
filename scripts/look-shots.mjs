// Look-check capture for graphics work: title, then famous corners in several camera modes.
// Usage: [VIEWS=hell,skyline] [GFX=<graphics json>] [TIER=high|medium|low] node scripts/look-shots.mjs <outdir> [url]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { answerSteerQuestion } from './steer-question.mjs';
const out = process.argv[2]; const url = process.argv[3] ?? 'http://127.0.0.1:5195/';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
process.on('uncaughtException', (e) => { console.log(JSON.stringify({ failed: e.message.split('\n')[0], errors: errors.slice(0, 10) })); process.exit(1); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
if (process.env.GFX) {
  await page.evaluate((j) => { localStorage.setItem('bathurst.graphics.v1', j); }, process.env.GFX);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
}
const tier = process.env.TIER ?? 'high';
await page.evaluate((q) => { localStorage.setItem('bathurst.quality.v3', JSON.stringify({ quality: q, pixelRatio: null, automatic: false })); }, tier);
if (!process.env.GFX) { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 }); }
await page.waitForTimeout(2500);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
await shot('01-title');
await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Start time trial', exact: true }).click();
await answerSteerQuestion(page);
await page.waitForFunction(() => window.__game?.race?.session.lights < 0, null, { timeout: 30000 });
const g = (fn, a) => page.evaluate(fn, a);
await g(() => { window.__game.setDebugAutopilot(true); });
const ALL = [['hell', 380, 'chase'], ['mountain', 1000, 'chase'], ['cutting', 1990, 'tv'], ['skyline', 3330, 'chase'], ['dipper', 3560, 'cockpit'], ['forrests', 3900, 'tv'], ['conrod', 4500, 'bonnet'], ['chase', 5480, 'chase'], ['murrays', 6060, 'chaseFar']];
const views = process.env.VIEWS ? ALL.filter(v => process.env.VIEWS.split(',').includes(v[0])) : ALL;
for (const [name, s, mode] of views) {
  await g(([s, m]) => { const game = window.__game; game.debugTeleport(s); game.rig.mode = m; game.rig.snap(); }, [s, mode]);
  await page.waitForTimeout(1800);
  await shot(`${name}-${mode}`);
}
const info = await g(() => { const r = window.__game?.renderer?.info; return r ? { calls: r.render.calls, tris: r.render.triangles, fps: window.__game.settings?.showFps } : null; });
console.log(JSON.stringify({ info, errors: errors.slice(0, 10) }));
await browser.close();
