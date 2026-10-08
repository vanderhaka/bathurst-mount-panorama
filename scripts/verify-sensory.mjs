// Run on a local/preview build with its audio harness and existing __game hook.
// Native Web Audio calls are observed; this does not judge human listening quality.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';

const url = process.argv[2] ?? 'http://127.0.0.1:5181/';
const out = process.argv[3] ?? 'artifacts/review/item-3.10';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [], proof = { url, errors, listeningJudgement: false };
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(() => {
  const nodes = [], records = new WeakMap(), params = new WeakMap(), waves = new WeakMap();
  const record = (node, kind) => {
    if (!records.has(node)) {
      const r = { node, kind, outputs: [], starts: [], wave: null };
      records.set(node, r); nodes.push(r);
    }
    return records.get(node);
  };
  for (const [method, kind] of Object.entries({ createGain: 'gain', createBiquadFilter: 'filter',
    createOscillator: 'osc', createBufferSource: 'source', createWaveShaper: 'shaper',
    createDynamicsCompressor: 'compressor', createAnalyser: 'analyser' })) {
    const original = BaseAudioContext.prototype[method];
    BaseAudioContext.prototype[method] = function (...args) { const n = original.apply(this, args); record(n, kind); return n; };
  }
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...args) {
    const result = connect.call(this, target, ...args);
    if (target instanceof AudioNode) record(this).outputs.push(record(target));
    return result;
  };
  for (const method of ['setTargetAtTime', 'setValueAtTime']) {
    const original = AudioParam.prototype[method];
    AudioParam.prototype[method] = function (value, ...args) {
      const result = original.call(this, value, ...args); params.set(this, value); return result;
    };
  }
  const periodic = BaseAudioContext.prototype.createPeriodicWave;
  BaseAudioContext.prototype.createPeriodicWave = function (real, imag, ...args) {
    const wave = periodic.call(this, real, imag, ...args);
    waves.set(wave, { terms: imag.length, generated: imag.some(v => v !== 0) }); return wave;
  };
  const setWave = OscillatorNode.prototype.setPeriodicWave;
  OscillatorNode.prototype.setPeriodicWave = function (wave) { setWave.call(this, wave); record(this).wave = waves.get(wave); };
  for (const type of [OscillatorNode, AudioBufferSourceNode]) {
    const start = type.prototype.start;
    type.prototype.start = function (...args) {
      start.apply(this, args); record(this).starts.push({ at: args[0] ?? this.context.currentTime, observedAt: this.context.currentTime });
    };
  }
  const value = param => params.get(param) ?? param?.value ?? 0;
  const peak = buffer => {
    if (!buffer) return 0;
    let max = 0; const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += Math.max(1, Math.floor(data.length / 8192))) max = Math.max(max, Math.abs(data[i]));
    return max;
  };
  const reaches = (r, seen = new Set()) => {
    if (!r || seen.has(r)) return false;
    if (r.node === r.node.context.destination) return true;
    seen.add(r); return r.outputs.some(n => reaches(n, seen));
  };
  const gainOut = r => r?.outputs.find(n => n.kind === 'gain');
  window.__sensory = { nodes, value, snapshot: () => {
    const band = nodes.find(r => r.kind === 'filter' && r.node.frequency.value === 680);
    const source = nodes.find(r => r.kind === 'source' && r.outputs.includes(band));
    const rumble = nodes.find(r => r.kind === 'osc' && r.wave?.terms === 33);
    const kerb = gainOut(gainOut(rumble?.outputs.find(r => r.kind === 'filter' && r.node.frequency.value === 520)));
    const whine = nodes.filter(r => r.kind === 'osc' && r.wave?.terms === 4);
    return { context: band?.node.context.state, sampleRate: band?.node.context.sampleRate,
      scrub: { gain: value(gainOut(band)?.node.gain), routed: reaches(band), generated: peak(source?.node.buffer) > 0.1,
        loop: source?.node.loop, starts: source?.starts.length },
      kerb: { hz: value(rumble?.node.frequency), gain: value(kerb?.node.gain), generated: rumble?.wave?.generated,
        starts: rumble?.starts.length, routed: reaches(rumble) },
      whine: whine.map(r => ({ hz: value(r.node.frequency), gain: value(gainOut(gainOut(r))?.node.gain),
        generated: r.wave.generated, routed: reaches(r), starts: r.starts.length })),
      shots: nodes.filter(r => r.kind === 'source' && !r.node.loop && r.starts.length).map(r => ({
        duration: r.node.buffer?.duration, peak: peak(r.node.buffer), gain: value(gainOut(r)?.node.gain),
        starts: r.starts, routed: reaches(r) })) };
  } };
});

const snapshot = () => page.evaluate(() => window.__sensory.snapshot());
const settleInputs = async () => {
  await page.waitForFunction(() => window.__game.state === 'race' && !window.__game.input.menusOpen);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};
const slider = async (id, value) => {
  await page.locator(`#${id}`).evaluate((e, v) => { e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); }, value);
};
const nativeSetting = async (label, target, direction, max = 10) => {
  const row = page.locator(`[aria-label^="${label}:"]`);
  for (let i = 0; i < max && !(await row.getAttribute('aria-label')).includes(`${label}: ${target}.`); i++) {
    await page.getByRole('button', { name: `${direction} ${label.toLowerCase()}`, exact: true }).click();
  }
  assert.match(await row.getAttribute('aria-label'), new RegExp(`${label}: ${target}\\.`));
};
const cameraReading = () => page.evaluate(() => {
  const g = window.__game, v = g.race.player.vehicle, m = g.race.player.model, cam = g.stage.camera;
  const anchor = m.cockpitCamera.getWorldPosition(cam.position.clone());
  const bodyAnchor = anchor.clone();
  anchor.add(cam.position.clone().set(0, -(g.race.player.flatSpotHeave ?? 0) * (1 - g.settings.headMotion), 0).applyQuaternion(m.root.quaternion));
  const quaternion = m.cockpitCamera.getWorldQuaternion(cam.quaternion.clone());
  const rear = cam.position.clone().set(0, 1.62, -0.9).applyQuaternion(m.root.quaternion).add(m.root.position);
  return { mode: g.rig.mode, amount: g.settings.headMotion, lookBack: g.rig.lookBack,
    gLong: v.telemetry.gLong, gLat: v.telemetry.gLat, head: { ...g.rig.head.pose },
    gap: cam.position.distanceTo(anchor), bodyGap: cam.position.distanceTo(bodyAnchor), flatSpotHeave: g.race.player.flatSpotHeave,
    angle: cam.quaternion.angleTo(quaternion), rearGap: cam.position.distanceTo(rear),
    liveAudio: window.__liveSound, graph: window.__sensory.snapshot(), compound: v.stint.tyreModel.compound };
});
try {
  await authenticatePreview(page, url);
  await page.goto(new URL('/harness/audio.html', url).href);
  await page.waitForFunction(() => window.__shotReady);
  await page.getByRole('button', { name: 'Start audio', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.status').textContent.includes('context: running'));
  for (const [id, value] of Object.entries({ rpm: 6000, load: 0.5, throttle: 0.5, speedKmh: 90, scrub: 0.7, slip: 0, interior: 1 })) await slider(id, value);
  await page.locator('aside select').nth(1).selectOption('4');
  await page.locator('aside select').nth(2).selectOption('kerb');
  await page.waitForTimeout(250); proof.drivingGraph = await snapshot();
  const graph = proof.drivingGraph;
  assert.equal(graph.context, 'running');
  assert(graph.scrub.generated && graph.scrub.loop && graph.scrub.routed && graph.scrub.starts === 1 && graph.scrub.gain > 0.1);
  assert(graph.kerb.generated && graph.kerb.routed && graph.kerb.starts === 1 && graph.kerb.gain > 0.5);
  assert(Math.abs(graph.kerb.hz - 90 / 3.6 / 0.4) < 1e-6);
  assert.equal(graph.whine.length, 2); assert.equal(graph.whine[0].hz, 1900);
  assert(graph.whine.every(w => w.generated && w.routed && w.starts === 1 && w.hz > 0 && w.gain > 0));
  await slider('speedKmh', 0); await page.locator('aside select').nth(1).selectOption('0');
  await page.locator('aside select').nth(2).selectOption('asphalt');
  await page.waitForTimeout(150); proof.silentGraph = await snapshot();
  assert.equal(proof.silentGraph.scrub.gain, 0); assert.equal(proof.silentGraph.kerb.gain, 0);
  assert(proof.silentGraph.whine.every(w => w.gain === 0));
  await slider('rpm', 4000); await slider('speedKmh', 90);
  await page.locator('aside select').nth(1).selectOption('4'); await page.waitForTimeout(150);
  const before = (await snapshot()).shots.length;
  await page.getByRole('button', { name: 'Shift down', exact: true }).click(); await page.waitForTimeout(150);
  proof.downshift = (await snapshot()).shots.slice(before);
  assert.equal(proof.downshift.length, 2);
  const pop = proof.downshift.find(s => Math.abs(s.duration - 0.1) < 1e-6);
  assert(pop?.routed && pop.gain > 0.3 && Math.abs(pop.peak - 0.9) < 0.002);
  assert(Math.abs(pop.starts[0].at - pop.starts[0].observedAt - 0.04) < 0.02);
  await page.waitForTimeout(250); assert.equal((await snapshot()).shots.length, before + 2);

  await page.goto(url); await page.waitForFunction(() => window.__shotReady);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Display', exact: true }).click();
  await nativeSetting('Camera', 'Cockpit', 'Next', 5);
  await nativeSetting('Head movement', '50%', 'Previous');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.mn-screen--title').getByRole('button', { name: 'Time trial', exact: true }).click();
  await page.getByRole('button', { name: 'Next tyres', exact: true }).click();
  await page.getByRole('button', { name: 'Start time trial', exact: true }).click();
  await page.waitForFunction(() => window.__game.race.session.lights < 0 && !window.__game.input.menusOpen);
  await settleInputs();
  await page.evaluate(() => {
    const g = window.__game, audio = g.audio, update = audio.update;
    audio.update = function (frame, dt) {
      const wheels = g.race.player.vehicle.wheels, load = wheels.reduce((s, w) => s + Math.max(0, w.load), 0);
      const demand = wheels.reduce((s, w) => s + Math.max(0, w.load) * Math.max(0, Math.min(1, w.slip)), 0);
      const x = Math.max(0, Math.min(1, ((load > 0 ? demand / load : 0) - 0.3) / 0.6));
      window.__liveSound = { scrub: frame.scrub, expected: x * x * (3 - 2 * x), speedKmh: frame.speedKmh };
      return update.call(this, frame, dt);
    };
  });
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(3500); await page.keyboard.down('ArrowRight');
  proof.moving = [];
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(100); proof.moving.push(await cameraReading()); }
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
  assert(proof.moving.some(r => Math.abs(r.gLong) + Math.abs(r.gLat) > 0.05 && r.gap > 0.001));
  assert(proof.moving.every(r => r.mode === 'cockpit' && r.amount === 0.5 && r.compound === 'hard'));
  assert(proof.moving.every(r => Math.abs(r.liveAudio.scrub - r.liveAudio.expected) < 1e-8));
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__game.state === 'paused');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Display', exact: true }).click();
  await nativeSetting('Head movement', 'Off', 'Previous');
  proof.storedOff = await page.evaluate(() => JSON.parse(localStorage.getItem('bathurst.settings.v1')).headMotion);
  assert.equal(proof.storedOff, 0);
  await page.screenshot({ path: join(out, 'head-movement-off.png') });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() => window.__game.state === 'race' && !window.__game.input.menusOpen);
  await settleInputs();
  await page.evaluate(() => window.__game.rig.addShake(1)); await page.waitForTimeout(100);
  proof.off = await cameraReading();
  assert.equal(proof.off.amount, 0); assert.equal(proof.off.mode, 'cockpit');
  assert(Object.values(proof.off.head).every(v => v === 0)); assert(proof.off.gap < 1e-8 && proof.off.angle < 1e-7);
  await page.screenshot({ path: join(out, 'cockpit-off.png') });
  await page.keyboard.down('KeyV'); await page.waitForFunction(() => window.__game.rig.lookBack);
  await page.evaluate(() => window.__game.rig.addShake(1)); await page.waitForTimeout(100);
  proof.lookBackOff = await cameraReading(); await page.keyboard.up('KeyV');
  assert(proof.lookBackOff.rearGap < 1e-8 && Object.values(proof.lookBackOff.head).every(v => v === 0));
  await page.goto(new URL('/harness/audio.html?selftest=1', url).href);
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 60000 });
  proof.offlineAudio = await page.evaluate(() => window.__shotInfo);
  assert.equal(proof.offlineAudio.pass, true, 'native OfflineAudioContext self-test');
  assert.deepEqual(errors, []);
  writeFileSync(join(out, 'sensory-runtime.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ status: 'pass', graph: proof.drivingGraph, downshift: proof.downshift, off: proof.off, out }));
} catch (error) {
  proof.failure = String(error); writeFileSync(join(out, 'sensory-runtime.json'), JSON.stringify(proof, null, 2));
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {}); throw error;
} finally { await browser.close(); }
