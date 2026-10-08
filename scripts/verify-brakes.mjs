#!/usr/bin/env node
// Native controls and actual fixed-step models; fixtures change only pose and velocity.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';
import { answerSteerQuestion } from './steer-question.mjs';

export function adjustmentDirection(current, target) {
  return typeof current === 'number' && typeof target === 'number' && current > target ? 'Previous' : 'Next';
}

export function observeBrakes() {
  const game = window.__game, race = game.race, car = race.player, v = car.vehicle, session = race.session;
  const copy = () => JSON.parse(JSON.stringify({ discs: v.brakes.discs, spots: v.flatSpots.tyres,
    tyres: v.stint.tyres, fuelL: v.stint.fuel.litres, compound: v.stint.tyreModel.compound }));
  const probe = window.__brakesProbe = { phase: 'normal', phases: {}, laps: [], recoveries: [], grids: [], cameras: [] };
  window.__brakesSession = session; window.__brakesProfile = race.profiles.ai.speed;
  const simulate = car.simulate, update = session.update, sync = game.rig.update;
  let lapPeak = 22;
  car.simulate = function(...args) {
    const before = v.brakes.discs.map(d => d.tempC), result = Reflect.apply(simulate, this, args);
    const name = probe.phase, phase = probe.phases[name] ??= { samples: 0, peakC: 22, minForce: 1, cooling: 0, impacts: [], maxSpot: 0 };
    phase.samples++; phase.peakC = Math.max(phase.peakC, ...v.brakes.discs.map(d => d.tempC));
    phase.minForce = Math.min(phase.minForce, ...v.brakes.discs.map(d => d.forceMultiplier));
    phase.maxSpot = Math.max(phase.maxSpot, ...v.flatSpots.tyres.map(t => t.severity));
    if (v.telemetry.brake < .01 && v.speed > 50 && v.brakes.discs.some((d, i) => d.tempC < before[i])) phase.cooling++;
    phase.impacts.push(...result.map(hit => ({ s: v.tp.s, speed: hit.speed })));
    phase.last = copy();
    if (name === 'normal') lapPeak = Math.max(lapPeak, ...v.brakes.discs.map(d => d.tempC));
    return result;
  };
  session.update = function(...args) {
    const result = Reflect.apply(update, this, args);
    if (result && probe.phase === 'normal') { probe.laps.push({ ...result, peakC: lapPeak, ...copy() }); lapPeak = 22; }
    return result;
  };
  for (const [method, key] of [['resetToTrack', 'recoveries'], ['placeOnGrid', 'grids']]) {
    const original = session[method];
    session[method] = function(...args) {
      const before = copy(), result = Reflect.apply(original, this, args);
      probe[key].push({ before, after: copy() }); return result;
    };
  }
  game.rig.update = function(...args) {
    const result = Reflect.apply(sync, this, args), target = args[0];
    if (probe.phase === 'roll' && this.mode === 'cockpit' && !this.lookBack && probe.cameras.length < 2000) {
      const anchor = target.cockpit.getWorldPosition(this.camera.position.clone());
      const heave = car.flatSpotHeave, amount = target.headMotion ?? 1;
      const correction = this.camera.position.clone().set(0, -heave * (1 - amount), 0).applyQuaternion(target.quaternion);
      probe.cameras.push({ heave, bodyY: car.model.body.position.y, amount,
        error: this.camera.position.distanceTo(anchor.add(correction)) });
    }
    return result;
  };
}

export function checkNormal(probe) {
  assert.equal(probe.laps.length, 3, 'Three real laps must complete');
  assert.deepEqual(probe.laps.map(lap => lap.standing), [true, false, false]);
  assert.ok(probe.laps.slice(1).every(lap => lap.valid && lap.timeS > 115 && lap.timeS < 145));
  const normal = probe.phases.normal;
  assert.equal(normal.impacts.length, 0); assert.ok(normal.peakC > 150 && normal.peakC < 700);
  assert.equal(normal.minForce, 1); assert.equal(normal.maxSpot, 0); assert.ok(normal.cooling > 20);
  const work = lap => lap.discs.reduce((sum, disc) => sum + disc.energyJ, 0);
  assert.ok(work(probe.laps[2]) > work(probe.laps[0]) + 1e7);
  assert.ok(probe.laps[2].fuelL < probe.laps[0].fuelL); assert.equal(probe.recoveries.length, 0);
  return { timesS: probe.laps.map(lap => lap.timeS), peakC: normal.peakC, workJ: work(probe.laps[2]), coolingSamples: normal.cooling };
}

export function checkFresh(state, compound) {
  assert.equal(state.compound, compound); assert.equal(state.fuelL, 80);
  assert.ok(state.discs.every(d => d.tempC === 22 && d.energyJ === 0 && d.forceMultiplier === 1));
  assert.ok(state.spots.every(t => t.severity === 0 && t.gripMultiplier === 1));
  assert.ok(state.tyres.every(t => t.tempC === 52 && t.wear === 0));
}

function readState() {
  const game = window.__game, car = game.race.player, v = car.vehicle, discs = v.brakes.discs;
  const discMeshes = [], discInstanceCounts = [];
  car.model.root.traverse(o => { if (o.name === 'disc' && o.isMesh) {
    discMeshes.push(o.material.emissiveIntensity); discInstanceCounts.push(o.isInstancedMesh ? o.count : 1);
  } });
  return { state: game.state, sameSession: game.race.session === window.__brakesSession, speed: v.speed, simulationS: v.simulationS,
    discs: discs.map(d => ({ ...d })), spots: v.flatSpots.tyres.map(t => ({ ...t })), tyres: v.stint.tyres.map(t => ({ ...t })),
    fuelL: v.stint.fuel.litres, compound: v.stint.tyreModel.compound, sessionCompound: game.race.session.tyres,
    references: v.telemetry.brakes === discs && v.telemetry.flatSpots === v.flatSpots.tyres,
    profileRetained: game.race.profiles.ai.speed === window.__brakesProfile,
    abs: game.settings.abs, brake: v.telemetry.brake, valid: game.race.session.timer.valid, discMeshes, discInstanceCounts,
    hud: { front: document.querySelector('.hud-brakes__front')?.textContent,
      rear: document.querySelector('.hud-brakes__rear')?.textContent, fade: document.querySelector('.hud-brakes__fade')?.textContent,
      fading: document.querySelector('.hud-brakes')?.dataset.fade }, bodyHeave: car.flatSpotHeave };
}

export function checkDisplay(state) {
  assert.ok(state.references && state.profileRetained);
  assert.equal(Number(state.hud.front), Math.round((state.discs[0].tempC + state.discs[1].tempC) / 2));
  assert.equal(Number(state.hud.rear), Math.round((state.discs[2].tempC + state.discs[3].tempC) / 2));
  const loss = Math.round(100 * (1 - Math.min(...state.discs.map(d => d.forceMultiplier))));
  assert.equal(state.hud.fading, String(loss > 0)); assert.equal(state.hud.fade, loss > 0 ? `FADE ${loss}%` : '');
  const counts = state.discInstanceCounts ?? state.discMeshes.map(() => 1);
  assert.equal(counts.length, state.discMeshes.length);
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 4, 'Inspect four actual high-detail disc instances');
  const glow = Math.max(0, Math.min(1, (Math.max(...state.discs.map(d => d.tempC)) - 480) / 350)) * 3.2;
  for (const value of state.discMeshes) assert.ok(Math.abs(value - glow) < 1e-9);
}

async function main() {
  const engine = process.argv[2] ?? 'chromium', url = process.argv[3] ?? 'http://127.0.0.1:5181/';
  assert.ok(['chromium', 'webkit'].includes(engine));
  const output = resolve(process.argv[4] ?? '/private/tmp/bathurst-item-3.6-acceptance'); await mkdir(output, { recursive: true });
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const report = { engine, browser: browser.version(), origin: new URL(url).origin, status: 'running', errors: [], checkpoints: [],
    fixtures: ['Fresh isolated storage; three actual laps with preview debugAutopilot and timeScale=3',
      'Original simulation, session lifecycle and camera methods observed intact; native menu taps and keyboard pedals',
      'Stress/lock/roll fixtures set only entity pose and vehicle vx/vz; no heat, damage, timer, gear, model or telemetry injection'],
    limitations: ['Desktop browser evidence does not establish physical controller or phone vibration.'] };
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await authenticatePreview(page, url);
  const photo = name => page.screenshot({ path: resolve(output, `${engine}-${name}.png`), scale: 'css' });
  const save = async () => { report.probe = await page.evaluate(() => window.__brakesProbe).catch(() => null);
    await writeFile(resolve(output, `${engine}-brakes.json`), JSON.stringify(report, null, 2) + '\n'); };
  const button = (screen, name) => page.locator(`.mn-screen--${screen}`).getByRole('button', { name, exact: true });
  const ready = async () => {
    await page.waitForFunction(() => window.__game.state === 'race' && window.__game.race && !window.__game.input.menusOpen);
    await page.touchscreen.tap(420, 120); await page.locator('.tc-pedal--throttle').waitFor({ state: 'visible' });
    // The final touch chooses its device on the next frame; consume it before a keyboard pedal.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const pause = async () => {
    await page.touchscreen.tap(420, 120); await page.locator('.tc-btn--pause').waitFor({ state: 'visible' });
    await page.locator('.tc-btn--pause').tap(); await page.locator('.mn-screen--pause').waitFor({ state: 'visible' });
    assert.equal((await page.evaluate(readState)).state, 'paused');
  };
  const checkpoint = async name => { const state = await page.evaluate(readState); checkDisplay(state);
    report.checkpoints.push({ name, state }); await photo(name); await save(); return state; };
  const place = async (phase, s = 5400, speed = 82) => {
    await page.evaluate(({ phase, s, speed }) => {
      const game = window.__game, car = game.race.player, v = car.vehicle, line = game.race.session.line;
      window.__brakesProbe.phase = phase;
      car.reset(s, line.offset[Math.floor(s / v.track.spacing) % v.track.n]);
      v.vx = Math.sin(v.heading) * speed; v.vz = Math.cos(v.heading) * speed;
    }, { phase, s, speed });
  };
  const setting = async (tab, label, key, value) => {
    await page.getByRole('tab', { name: tab, exact: true }).tap();
    for (let i = 0; i < 15; i++) {
      const current = await page.evaluate(key => window.__game.settings[key], key);
      if (current === value) return;
      const direction = adjustmentDirection(current, value);
      await page.locator('.mn-screen--settings').getByRole('button', { name: `${direction} ${label.toLowerCase()}`, exact: true }).tap();
    }
    throw new Error(`Cannot choose ${label}`);
  };
  try {
    await page.goto(url); await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    await button('title', 'Time trial').tap(); await button('car', 'Start time trial').tap(); await answerSteerQuestion(page); await ready();
    await page.evaluate(observeBrakes); await checkpoint('fresh-soft');
    await page.evaluate(() => { window.__game.setDebugAutopilot(true); window.__game.timeScale = 3; });
    for (let count = 1; count <= 3; count++) {
      await page.waitForFunction(n => window.__brakesProbe.laps.length >= n, count, { timeout: 240000, polling: 100 });
      console.log(`Actual brake laps ${count}/3`); await checkpoint(`normal-lap-${count}`);
    }
    await page.evaluate(() => { window.__game.timeScale = 1; window.__game.setDebugAutopilot(false); });
    await pause(); report.normal = checkNormal(await page.evaluate(() => window.__brakesProbe));
    const paused = await page.evaluate(readState); await page.waitForTimeout(600);
    assert.deepEqual(await page.evaluate(readState), paused); report.pausePreservesModels = true;
    await button('pause', 'Resume').tap(); await ready();
    for (let stop = 1; stop <= 8; stop++) {
      await place('stress'); await page.keyboard.down('ArrowDown');
      try {
        await page.waitForFunction(() => window.__game.race.player.vehicle.telemetry.brake > .95);
        await page.waitForFunction(() => window.__game.race.player.vehicle.speed <= 32, null, { timeout: 10000, polling: 20 });
      }
      finally { await page.keyboard.up('ArrowDown'); }
      await page.waitForFunction(() => window.__game.race.player.vehicle.telemetry.brake < .01);
      const state = await checkpoint(`chase-stop-${stop}`);
      if (state.discs.some(d => d.forceMultiplier < .98)) break;
    }
    const stress = await page.evaluate(() => window.__brakesProbe.phases.stress);
    assert.ok(stress.peakC > 700 && stress.minForce < .98); assert.equal(stress.impacts.length, 0); assert.equal(stress.maxSpot, 0);
    await pause(); await page.locator('.mn-screen--pause').getByRole('button', { name: /^Reset to track:/ }).tap(); await ready();
    let recovery = await page.evaluate(() => window.__brakesProbe.recoveries.at(-1)); assert.deepEqual(recovery.after, recovery.before);
    await checkpoint('hot-recovery'); await pause(); await button('pause', 'Settings').tap();
    await setting('Driving assists', 'ABS', 'abs', false);
    report.headMotionAvailable = await page.evaluate(() => typeof window.__game.settings.headMotion === 'number');
    if (report.headMotionAvailable) await setting('Display', 'Head movement', 'headMotion', 0);
    await button('settings', 'Done').tap(); await button('pause', 'Restart').tap(); await ready();
    checkFresh(await page.evaluate(() => window.__brakesProbe.grids.at(-1).after), 'soft');
    await page.waitForFunction(() => window.__game.race.session.racing, null, { timeout: 20000 });
    await place('lock', 1300, 50); await page.keyboard.down('ArrowDown');
    try { await page.waitForFunction(() => window.__game.race.player.vehicle.flatSpots.tyres.some(t => t.severity > .05), null, { timeout: 5000, polling: 20 }); }
    finally { await page.keyboard.up('ArrowDown'); }
    await page.waitForFunction(() => window.__game.race.player.vehicle.telemetry.brake < .01);
    const locked = await checkpoint('abs-off-flat-spots'); assert.ok(!locked.abs && locked.spots.some(t => t.gripMultiplier < 1));
    assert.equal((await page.evaluate(() => window.__brakesProbe.phases.lock)).impacts.length, 0);
    for (let i = 0; i < 5 && await page.evaluate(() => window.__game.rig.mode !== 'cockpit'); i++) {
      await page.keyboard.press('c'); await page.waitForTimeout(120);
    }
    assert.equal(await page.evaluate(() => window.__game.rig.mode), 'cockpit'); await place('roll', 1300, 30);
    await page.waitForTimeout(900); await checkpoint('damaged-cockpit');
    const cameras = await page.evaluate(() => window.__brakesProbe.cameras);
    assert.ok(cameras.length > 5 && Math.max(...cameras.map(c => c.heave)) - Math.min(...cameras.map(c => c.heave)) > 1e-5);
    assert.ok(cameras.every(c => Math.abs(c.heave) <= .0024 && c.bodyY === c.heave));
    if (report.headMotionAvailable) assert.ok(cameras.every(c => c.amount === 0 && c.error < 1e-7), 'Off must remove artificial cockpit heave');
    await pause(); await page.locator('.mn-screen--pause').getByRole('button', { name: /^Reset to track:/ }).tap(); await ready();
    recovery = await page.evaluate(() => window.__brakesProbe.recoveries.at(-1)); assert.deepEqual(recovery.after, recovery.before);
    assert.ok(recovery.after.spots.some(t => t.severity > .05)); await checkpoint('damaged-recovery');
    await pause(); await button('pause', 'Restart').tap(); await ready();
    checkFresh(await page.evaluate(() => window.__brakesProbe.grids.at(-1).after), 'soft'); await checkpoint('fresh-restart');
    await pause(); await button('pause', 'Quit to menu').tap(); await button('title', 'Time trial').tap();
    await button('car', 'Next tyres').tap();
    assert.equal((await page.locator('.mn-screen--car [aria-label^="Tyres:"] .mn-value__v').textContent()).trim(), 'Hard');
    report.finishedSessionProbe = await page.evaluate(() => window.__brakesProbe); await save();
    await page.evaluate(() => {
      const game = window.__game, original = game.startRace;
      game.startRace = function(...args) {
        const result = Reflect.apply(original, this, args), v = this.race.player.vehicle;
        window.__brakesNewRace = JSON.parse(JSON.stringify({ discs: v.brakes.discs, spots: v.flatSpots.tyres,
          tyres: v.stint.tyres, fuelL: v.stint.fuel.litres, compound: v.stint.tyreModel.compound }));
        return result;
      };
    });
    await button('car', 'Start time trial').tap(); await ready(); await page.evaluate(observeBrakes);
    const hard = await checkpoint('fresh-hard'); assert.equal(hard.sessionCompound, 'hard');
    report.newRaceFresh = await page.evaluate(() => window.__brakesNewRace); checkFresh(report.newRaceFresh, 'hard');
    assert.ok(hard.discs.every(d => d.tempC < 23 && d.energyJ === 0)); assert.ok(hard.spots.every(t => t.severity === 0));
    assert.ok(hard.fuelL > 79.99 && hard.fuelL <= 80); assert.deepEqual(report.errors, []); report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error); report.atFailure = await page.evaluate(readState).catch(() => null);
    await photo('failure').catch(() => {}); throw error;
  } finally { await save(); await browser.close(); }
  console.log(JSON.stringify({ engine, status: report.status, normal: report.normal, checkpoints: report.checkpoints.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
