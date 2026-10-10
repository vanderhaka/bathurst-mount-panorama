#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5180/';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Controlled laps must use a local game server');
const output = resolve(process.argv[3] ?? 'artifacts/shootout-live');
await mkdir(output, { recursive: true });
const nickname = `Setup check ${Date.now().toString(36)}`;
const report = { url, nickname, api: 'Actual hosted Supabase through the game API', lapDriver: 'Controlled positions through RaceSession and LapTimer; not manual driving', checks: [], errors: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
let player;
const check = (name, value) => { assert.ok(value, name); report.checks.push(name); };
const press = (page, name) => page.getByRole('button', { name, exact: true }).click();
const screen = (page, id) => page.locator(`.mn-screen--${id}`);
const ledger = page => page.evaluate(() => JSON.parse(localStorage.getItem('bathurst.shootout.v1') ?? 'null'));
const screenshot = (page, name) => page.screenshot({ path: resolve(output, `${name}.png`) });

async function open() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    navigator.getGamepads = () => [];
    localStorage.setItem('bathurst.settings.v1', JSON.stringify({ onboarded: true, steerOnboarded: true, quality: 'low', autoQuality: false }));
    localStorage.setItem('bathurst.quality.v1', JSON.stringify({ quality: 'low', autoQuality: false }));
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90_000 });
  return page;
}

async function warmup(page) {
  await press(page, 'Shootout Top 10');
  await page.getByRole('button', { name: 'Choose car', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.mn-screen--shootout .mn-btn--primary').disabled);
  await press(page, 'Choose car');
  await press(page, 'Start warm-up');
  await page.waitForFunction(() => window.__game.state === 'race');
}

async function advance(page, target) {
  const phase = await page.evaluate(targetPhase => {
    const game = window.__game;
    game.state = 'paused';
    const session = game.race.session;
    const vehicle = game.race.player.vehicle;
    while (!session.racing) session.updateLights(0.1);
    for (const wheel of vehicle.wheels) wheel.surface = 'road';
    for (let step = 0; step < 10_000 && session.shootout.phase !== targetPhase; step++) {
      vehicle.tp.s = session.track.wrapS(vehicle.tp.s + 50 / 30);
      session.update(1 / 30);
    }
    game.state = 'race';
    return session.shootout.phase;
  }, target);
  assert.equal(phase, target);
}

async function post(page, body) {
  return page.evaluate(async body => {
    const response = await fetch('/api/shootout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, body);
}

try {
  player = await open();
  await warmup(player);
  check('The connected Top 10 can start a warm-up', await ledger(player) === null);
  await advance(player, 'ready');
  await player.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed', null, { timeout: 15_000 });
  const first = await ledger(player);
  check('Starting the timed lap receives a hosted allocation', first.attempts.length === 1 && first.attempts[0].online);
  report.browserHash = createHash('sha256').update(first.browserToken).digest('hex');
  await advance(player, 'finished');
  await screen(player, 'shootoutResult').waitFor({ state: 'visible' });
  await player.locator('#shootout-nickname').fill(nickname);
  await press(player, 'Submit to leaderboard');
  await player.waitForFunction(() => document.querySelector('.mn-screen--shootoutResult .mn-shootout-status').textContent.includes('Score submitted'), null, { timeout: 15_000 });
  const saved = await player.evaluate(id => JSON.parse(localStorage.getItem(`bathurst.shootout.v1.result.${id}`)), first.attempts[0].id);
  check('The hosted service confirms publication', saved.publication === 'published');
  report.published = { attemptId: first.attempts[0].id, timeS: saved.outcome.timeS, sectorsS: saved.outcome.sectorsS };
  await screenshot(player, 'published');

  const viewer = await open();
  await press(viewer, 'Shootout Top 10');
  await viewer.locator('.mn-shootout-board tbody tr').filter({ hasText: nickname }).waitFor({ state: 'visible', timeout: 15_000 });
  check('A separate browser reads the submitted score from Supabase', await ledger(viewer) === null);
  await screenshot(viewer, 'second-browser-board');

  const startBody = { action: 'start', format: 'top10', browserToken: first.browserToken, requestId: first.attempts[0].id, number: 1, car: first.attempts[0].car };
  check('Retrying allocation returns the same hosted attempt', (await post(player, startBody)).status === 200);
  const submitBody = { action: 'submit', format: 'top10', browserToken: first.browserToken, attemptId: first.attempts[0].id, nickname, timeS: saved.outcome.timeS, sectorsS: saved.outcome.sectorsS };
  check('Retrying publication succeeds without another score', (await post(player, submitBody)).status === 200);
  check('A published score cannot be overwritten', (await post(player, { ...submitBody, nickname: 'Changed score' })).status === 409);

  await press(player, 'Main menu');
  await warmup(player);
  check('The second warm-up keeps only one consumed attempt', (await ledger(player)).attempts.length === 1);
  await advance(player, 'ready');
  await player.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
  await player.keyboard.press('Escape');
  await screen(player, 'pause').waitFor({ state: 'visible' });
  await press(player, 'Quit to menu');
  check('Abandoning the timed lap retains its second hosted attempt', (await ledger(player)).attempts.length === 2);

  await warmup(player);
  check('The third warm-up keeps only two consumed attempts', (await ledger(player)).attempts.length === 2);
  await advance(player, 'ready');
  await player.waitForFunction(() => window.__game.race.session.shootout.phase === 'timed');
  await advance(player, 'finished');
  await screen(player, 'shootoutResult').waitFor({ state: 'visible' });
  await press(player, 'Skip leaderboard');
  check('Skipping warns about recognition and the consumed attempt', /will not count as a leaderboard score/.test(await player.locator('.mn-shootout-warning').innerText()));
  await press(player, 'Skip this score');
  check('Skipping publication leaves all three attempts used', (await ledger(player)).attempts.length === 3);
  check('The server rejects a fourth allocation', (await post(player, { ...startBody, requestId: randomUUID(), number: 3 })).status === 409);
  await press(player, 'Main menu');
  await player.reload();
  await player.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90_000 });
  await press(player, 'Shootout Top 10');
  check('Reload keeps Top 10 exhausted', (await ledger(player)).attempts.length === 3 && await player.getByRole('button', { name: 'Choose car', exact: true }).isDisabled());
  await screenshot(player, 'exhausted');
  check('The browser reported no runtime errors', report.errors.length === 0);
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  if (player) {
    const final = await ledger(player).catch(() => null);
    if (final) {
      report.browserHash = createHash('sha256').update(final.browserToken).digest('hex');
      report.attemptIds = final.attempts.map(attempt => attempt.id);
    }
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
